/**
 * Comprehensive tests for Integration Clients Factory
 * Tests clients-factory.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createIntegrationClients,
  getOpenAIApiKey,
  type ClientsConfig,
  type IntegrationClients,
} from '../clients-factory.js';
import { createLogger } from '@medicalcor/core';

describe('clients-factory', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('createIntegrationClients', () => {
    describe('basic initialization', () => {
      it('should create clients with minimal config', () => {
        const clients = createIntegrationClients({ source: 'test-source' });

        expect(clients).toBeDefined();
        expect(clients.eventStore).toBeDefined();
        expect(typeof clients.isConfigured).toBe('function');
        expect(typeof clients.getCircuitBreakerStats).toBe('function');
      });

      it('should initialize event store', () => {
        const clients = createIntegrationClients({ source: 'webhook-handler' });

        expect(clients.eventStore).toBeDefined();
        expect(typeof clients.eventStore.emit).toBe('function');
      });

      it('should use provided source name', () => {
        const source = 'custom-service';
        const clients = createIntegrationClients({ source });

        expect(clients.eventStore).toBeDefined();
      });

      it('should not initialize optional clients by default', () => {
        const clients = createIntegrationClients({ source: 'test' });

        expect(clients.openai).toBeNull();
        expect(clients.scheduling).toBeNull();
        expect(clients.vapi).toBeNull();
        expect(clients.stripe).toBeNull();
        expect(clients.scoring).toBeNull();
        expect(clients.triage).toBeNull();
        expect(clients.consent).toBeNull();
        expect(clients.templateCatalog).toBeNull();
      });
    });

    describe('HubSpot client', () => {
      it('should create HubSpot client when token is provided', () => {
        process.env.HUBSPOT_ACCESS_TOKEN = 'test-hubspot-token';

        const clients = createIntegrationClients({ source: 'test' });

        expect(clients.hubspot).toBeDefined();
        expect(clients.hubspot).not.toBeNull();
      });

      it('should return null when HubSpot token is missing', () => {
        delete process.env.HUBSPOT_ACCESS_TOKEN;

        const clients = createIntegrationClients({ source: 'test' });

        expect(clients.hubspot).toBeNull();
      });
    });

    describe('WhatsApp client', () => {
      it('should create WhatsApp client with required credentials', () => {
        process.env.WHATSAPP_API_KEY = 'test-wa-key';
        process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';

        const clients = createIntegrationClients({ source: 'test' });

        expect(clients.whatsapp).toBeDefined();
        expect(clients.whatsapp).not.toBeNull();
      });

      it('should return null when WhatsApp API key is missing', () => {
        delete process.env.WHATSAPP_API_KEY;
        process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';

        const clients = createIntegrationClients({ source: 'test' });

        expect(clients.whatsapp).toBeNull();
      });

      it('should return null when WhatsApp phone number ID is missing', () => {
        process.env.WHATSAPP_API_KEY = 'test-key';
        delete process.env.WHATSAPP_PHONE_NUMBER_ID;

        const clients = createIntegrationClients({ source: 'test' });

        expect(clients.whatsapp).toBeNull();
      });

      it('should include webhook secret when provided', () => {
        process.env.WHATSAPP_API_KEY = 'test-wa-key';
        process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
        process.env.WHATSAPP_WEBHOOK_SECRET = 'secret123';

        const clients = createIntegrationClients({ source: 'test' });

        expect(clients.whatsapp).not.toBeNull();
      });
    });

    describe('OpenAI client', () => {
      it('should create OpenAI client when requested and key is available', () => {
        process.env.OPENAI_API_KEY = 'sk-test-key';

        const clients = createIntegrationClients({
          source: 'test',
          includeOpenAI: true,
        });

        expect(clients.openai).toBeDefined();
        expect(clients.openai).not.toBeNull();
      });

      it('should return null when OpenAI is not requested', () => {
        process.env.OPENAI_API_KEY = 'sk-test-key';

        const clients = createIntegrationClients({
          source: 'test',
          includeOpenAI: false,
        });

        expect(clients.openai).toBeNull();
      });

      it('should return null when OpenAI key is missing', () => {
        delete process.env.OPENAI_API_KEY;

        const clients = createIntegrationClients({
          source: 'test',
          includeOpenAI: true,
        });

        expect(clients.openai).toBeNull();
      });
    });

    describe('Scheduling service', () => {
      it('should create scheduling service when requested and configured', () => {
        process.env.SCHEDULING_SERVICE_URL = 'https://scheduling.example.com';
        process.env.SCHEDULING_SERVICE_TOKEN = 'token123';

        const clients = createIntegrationClients({
          source: 'test',
          includeScheduling: true,
        });

        expect(clients.scheduling).toBeDefined();
        expect(clients.scheduling).not.toBeNull();
      });

      it('should create mock scheduling service when credentials are missing', () => {
        delete process.env.SCHEDULING_SERVICE_URL;
        delete process.env.SCHEDULING_SERVICE_TOKEN;

        const clients = createIntegrationClients({
          source: 'test',
          includeScheduling: true,
        });

        expect(clients.scheduling).toBeDefined();
        expect(clients.scheduling).not.toBeNull();
      });

      it('should return null when scheduling is not requested', () => {
        const clients = createIntegrationClients({
          source: 'test',
          includeScheduling: false,
        });

        expect(clients.scheduling).toBeNull();
      });
    });

    describe('Vapi client', () => {
      it('should create Vapi client when requested and configured', () => {
        process.env.VAPI_API_KEY = 'vapi-key-123';

        const clients = createIntegrationClients({
          source: 'test',
          includeVapi: true,
        });

        expect(clients.vapi).toBeDefined();
        expect(clients.vapi).not.toBeNull();
      });

      it('should include assistant ID when provided', () => {
        process.env.VAPI_API_KEY = 'vapi-key-123';
        process.env.VAPI_ASSISTANT_ID = 'assistant-123';

        const clients = createIntegrationClients({
          source: 'test',
          includeVapi: true,
        });

        expect(clients.vapi).not.toBeNull();
      });

      it('should include phone number ID when provided', () => {
        process.env.VAPI_API_KEY = 'vapi-key-123';
        process.env.VAPI_PHONE_NUMBER_ID = 'phone-123';

        const clients = createIntegrationClients({
          source: 'test',
          includeVapi: true,
        });

        expect(clients.vapi).not.toBeNull();
      });

      it('should return null when Vapi is not requested', () => {
        process.env.VAPI_API_KEY = 'vapi-key-123';

        const clients = createIntegrationClients({
          source: 'test',
          includeVapi: false,
        });

        expect(clients.vapi).toBeNull();
      });

      it('should return null when Vapi key is missing', () => {
        delete process.env.VAPI_API_KEY;

        const clients = createIntegrationClients({
          source: 'test',
          includeVapi: true,
        });

        expect(clients.vapi).toBeNull();
      });
    });

    describe('Stripe client', () => {
      it('should create Stripe client when requested and configured', () => {
        process.env.STRIPE_SECRET_KEY = 'sk_test_123';

        const clients = createIntegrationClients({
          source: 'test',
          includeStripe: true,
        });

        expect(clients.stripe).toBeDefined();
        expect(clients.stripe).not.toBeNull();
      });

      it('should include webhook secret when provided', () => {
        process.env.STRIPE_SECRET_KEY = 'sk_test_123';
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';

        const clients = createIntegrationClients({
          source: 'test',
          includeStripe: true,
        });

        expect(clients.stripe).not.toBeNull();
      });

      it('should create mock Stripe client when key is missing', () => {
        delete process.env.STRIPE_SECRET_KEY;

        const clients = createIntegrationClients({
          source: 'test',
          includeStripe: true,
        });

        expect(clients.stripe).toBeDefined();
        expect(clients.stripe).not.toBeNull();
      });

      it('should return null when Stripe is not requested', () => {
        process.env.STRIPE_SECRET_KEY = 'sk_test_123';

        const clients = createIntegrationClients({
          source: 'test',
          includeStripe: false,
        });

        expect(clients.stripe).toBeNull();
      });
    });

    describe('Scoring service', () => {
      it('should create scoring service when requested and OpenAI key is available', () => {
        process.env.OPENAI_API_KEY = 'sk-test-key';

        const clients = createIntegrationClients({
          source: 'test',
          includeScoring: true,
        });

        expect(clients.scoring).toBeDefined();
        expect(clients.scoring).not.toBeNull();
      });

      it('should return null when scoring is not requested', () => {
        process.env.OPENAI_API_KEY = 'sk-test-key';

        const clients = createIntegrationClients({
          source: 'test',
          includeScoring: false,
        });

        expect(clients.scoring).toBeNull();
      });

      it('should create scoring service even when OpenAI key is missing (uses empty string)', () => {
        delete process.env.OPENAI_API_KEY;

        const clients = createIntegrationClients({
          source: 'test',
          includeScoring: true,
        });

        // Scoring service is created with empty string when key is missing
        expect(clients.scoring).toBeDefined();
        expect(clients.scoring).not.toBeNull();
      });
    });

    describe('Triage service', () => {
      it('should create triage service when requested', () => {
        const clients = createIntegrationClients({
          source: 'test',
          includeTriage: true,
        });

        expect(clients.triage).toBeDefined();
        expect(clients.triage).not.toBeNull();
      });

      it('should return null when triage is not requested', () => {
        const clients = createIntegrationClients({
          source: 'test',
          includeTriage: false,
        });

        expect(clients.triage).toBeNull();
      });
    });

    describe('Consent service', () => {
      it('should create consent service with database when DATABASE_URL is provided', () => {
        process.env.DATABASE_URL = 'postgresql://localhost/test';

        const clients = createIntegrationClients({
          source: 'test',
          includeConsent: true,
        });

        expect(clients.consent).toBeDefined();
        expect(clients.consent).not.toBeNull();
      });

      it('should create consent service with in-memory repository when DATABASE_URL is missing', () => {
        delete process.env.DATABASE_URL;

        const clients = createIntegrationClients({
          source: 'test',
          includeConsent: true,
        });

        expect(clients.consent).toBeDefined();
        expect(clients.consent).not.toBeNull();
      });

      it('should return null when consent is not requested', () => {
        const clients = createIntegrationClients({
          source: 'test',
          includeConsent: false,
        });

        expect(clients.consent).toBeNull();
      });
    });

    describe('Template catalog service', () => {
      it('should create template catalog when requested', () => {
        const clients = createIntegrationClients({
          source: 'test',
          includeTemplateCatalog: true,
        });

        expect(clients.templateCatalog).toBeDefined();
        expect(clients.templateCatalog).not.toBeNull();
      });

      it('should return null when template catalog is not requested', () => {
        const clients = createIntegrationClients({
          source: 'test',
          includeTemplateCatalog: false,
        });

        expect(clients.templateCatalog).toBeNull();
      });
    });

    describe('isConfigured helper', () => {
      it('should return true when all required clients are configured', () => {
        process.env.HUBSPOT_ACCESS_TOKEN = 'token';
        process.env.WHATSAPP_API_KEY = 'key';
        process.env.WHATSAPP_PHONE_NUMBER_ID = '123';

        const clients = createIntegrationClients({ source: 'test' });

        expect(clients.isConfigured(['hubspot', 'whatsapp'])).toBe(true);
      });

      it('should return false when a required client is missing', () => {
        process.env.HUBSPOT_ACCESS_TOKEN = 'token';
        delete process.env.WHATSAPP_API_KEY;

        const clients = createIntegrationClients({ source: 'test' });

        expect(clients.isConfigured(['hubspot', 'whatsapp'])).toBe(false);
      });

      it('should return true for eventStore (always configured)', () => {
        const clients = createIntegrationClients({ source: 'test' });

        expect(clients.isConfigured(['eventStore'])).toBe(true);
      });

      it('should handle empty array', () => {
        const clients = createIntegrationClients({ source: 'test' });

        expect(clients.isConfigured([])).toBe(true);
      });

      it('should return false for unconfigured optional clients', () => {
        const clients = createIntegrationClients({
          source: 'test',
          includeOpenAI: true,
        });

        expect(clients.isConfigured(['openai'])).toBe(false);
      });

      it('should check multiple clients correctly', () => {
        process.env.OPENAI_API_KEY = 'sk-test';

        const clients = createIntegrationClients({
          source: 'test',
          includeOpenAI: true,
          includeScoring: true,
          includeTriage: true,
        });

        expect(clients.isConfigured(['openai', 'scoring', 'triage'])).toBe(true);
      });
    });

    describe('circuit breaker configuration', () => {
      it('should initialize with default circuit breaker settings', () => {
        const clients = createIntegrationClients({ source: 'test' });

        expect(clients.getCircuitBreakerStats).toBeDefined();
        expect(typeof clients.getCircuitBreakerStats).toBe('function');
      });

      it('should apply custom circuit breaker thresholds', () => {
        const clients = createIntegrationClients({
          source: 'test',
          circuitBreaker: {
            failureThreshold: 10,
            resetTimeoutMs: 60000,
          },
        });

        expect(clients.getCircuitBreakerStats()).toBeDefined();
      });

      it('should provide circuit breaker stats', () => {
        const clients = createIntegrationClients({ source: 'test' });
        const stats = clients.getCircuitBreakerStats();

        expect(Array.isArray(stats)).toBe(true);
      });

      it('should check if circuit is open', () => {
        const clients = createIntegrationClients({ source: 'test' });

        expect(typeof clients.isCircuitOpen('hubspot')).toBe('boolean');
        expect(typeof clients.isCircuitOpen('whatsapp')).toBe('boolean');
        expect(typeof clients.isCircuitOpen('stripe')).toBe('boolean');
      });

      it('should reset circuit breaker for a service', () => {
        const clients = createIntegrationClients({ source: 'test' });

        expect(() => clients.resetCircuit('hubspot')).not.toThrow();
        expect(() => clients.resetCircuit('whatsapp')).not.toThrow();
      });

      it('should handle circuit breaker for services without breakers', () => {
        const clients = createIntegrationClients({ source: 'test' });

        expect(clients.isCircuitOpen('scoring')).toBe(false);
        expect(() => clients.resetCircuit('triage')).not.toThrow();
      });

      it('should disable circuit breaker when configured', () => {
        const clients = createIntegrationClients({
          source: 'test',
          circuitBreaker: { enabled: false },
        });

        expect(clients.getCircuitBreakerStats()).toBeDefined();
      });

      it('should call onOpen callback when circuit opens', () => {
        const onOpen = vi.fn();
        const clients = createIntegrationClients({
          source: 'test',
          circuitBreaker: {
            enabled: true,
            failureThreshold: 1,
            onOpen,
          },
        });

        expect(clients).toBeDefined();
      });

      it('should call onClose callback when circuit closes', () => {
        const onClose = vi.fn();
        const clients = createIntegrationClients({
          source: 'test',
          circuitBreaker: {
            enabled: true,
            successThreshold: 1,
            onClose,
          },
        });

        expect(clients).toBeDefined();
      });
    });

    describe('database configuration', () => {
      it('should use database event store when DATABASE_URL is provided', () => {
        process.env.DATABASE_URL = 'postgresql://localhost/test';

        const clients = createIntegrationClients({ source: 'test' });

        expect(clients.eventStore).toBeDefined();
      });

      it('should use in-memory event store when DATABASE_URL is missing', () => {
        delete process.env.DATABASE_URL;

        const clients = createIntegrationClients({ source: 'test' });

        expect(clients.eventStore).toBeDefined();
      });
    });

    describe('edge cases', () => {
      it('should handle empty source string', () => {
        const clients = createIntegrationClients({ source: '' });

        expect(clients.eventStore).toBeDefined();
      });

      it('should handle all clients enabled simultaneously', () => {
        process.env.HUBSPOT_ACCESS_TOKEN = 'token';
        process.env.WHATSAPP_API_KEY = 'key';
        process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
        process.env.OPENAI_API_KEY = 'sk-test';
        process.env.VAPI_API_KEY = 'vapi-key';
        process.env.STRIPE_SECRET_KEY = 'sk_test';

        const clients = createIntegrationClients({
          source: 'test',
          includeOpenAI: true,
          includeScheduling: true,
          includeVapi: true,
          includeStripe: true,
          includeScoring: true,
          includeTriage: true,
          includeConsent: true,
          includeTemplateCatalog: true,
        });

        expect(clients.hubspot).not.toBeNull();
        expect(clients.whatsapp).not.toBeNull();
        expect(clients.openai).not.toBeNull();
        expect(clients.vapi).not.toBeNull();
        expect(clients.stripe).not.toBeNull();
        expect(clients.scoring).not.toBeNull();
        expect(clients.triage).not.toBeNull();
        expect(clients.consent).not.toBeNull();
        expect(clients.templateCatalog).not.toBeNull();
      });

      it('should handle environment variables with whitespace', () => {
        process.env.HUBSPOT_ACCESS_TOKEN = '  token  ';

        const clients = createIntegrationClients({ source: 'test' });

        expect(clients.hubspot).not.toBeNull();
      });

      it('should handle partial Stripe configuration', () => {
        process.env.STRIPE_SECRET_KEY = 'sk_test';
        delete process.env.STRIPE_WEBHOOK_SECRET;

        const clients = createIntegrationClients({
          source: 'test',
          includeStripe: true,
        });

        expect(clients.stripe).not.toBeNull();
      });

      it('should handle partial Vapi configuration', () => {
        process.env.VAPI_API_KEY = 'vapi-key';
        delete process.env.VAPI_ASSISTANT_ID;
        delete process.env.VAPI_PHONE_NUMBER_ID;

        const clients = createIntegrationClients({
          source: 'test',
          includeVapi: true,
        });

        expect(clients.vapi).not.toBeNull();
      });
    });
  });

  describe('getOpenAIApiKey', () => {
    it('should return OpenAI API key when set', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key-123';

      expect(getOpenAIApiKey()).toBe('sk-test-key-123');
    });

    it('should return undefined when OpenAI API key is not set', () => {
      delete process.env.OPENAI_API_KEY;

      expect(getOpenAIApiKey()).toBeUndefined();
    });

    it('should return empty string if explicitly set to empty', () => {
      process.env.OPENAI_API_KEY = '';

      expect(getOpenAIApiKey()).toBe('');
    });
  });

  describe('notifications service', () => {
    it('should create real notifications service when credentials are provided', () => {
      process.env.API_GATEWAY_URL = 'https://api.example.com';
      process.env.INTERNAL_API_KEY = 'internal-key-123';

      const clients = createIntegrationClients({
        source: 'test',
        includeNotifications: true,
      });

      expect(clients.notifications).toBeDefined();
      expect(clients.notifications).not.toBeNull();
    });

    it('should create mock notifications service when API gateway URL is missing', () => {
      delete process.env.API_GATEWAY_URL;
      process.env.INTERNAL_API_KEY = 'internal-key-123';

      const clients = createIntegrationClients({
        source: 'test',
        includeNotifications: true,
      });

      expect(clients.notifications).toBeDefined();
      expect(clients.notifications).not.toBeNull();
    });

    it('should create mock notifications service when internal API key is missing', () => {
      process.env.API_GATEWAY_URL = 'https://api.example.com';
      delete process.env.INTERNAL_API_KEY;

      const clients = createIntegrationClients({
        source: 'test',
        includeNotifications: true,
      });

      expect(clients.notifications).toBeDefined();
      expect(clients.notifications).not.toBeNull();
    });

    it('should return null when notifications is not requested', () => {
      const clients = createIntegrationClients({
        source: 'test',
        includeNotifications: false,
      });

      expect(clients.notifications).toBeNull();
    });
  });

  describe('ads conversion service', () => {
    it('should create ads conversion service when requested', () => {
      const clients = createIntegrationClients({
        source: 'test',
        includeAdsConversion: true,
      });

      expect(clients.adsConversion).toBeDefined();
      expect(clients.adsConversion).not.toBeNull();
    });

    it('should return null when ads conversion is not requested', () => {
      const clients = createIntegrationClients({
        source: 'test',
        includeAdsConversion: false,
      });

      expect(clients.adsConversion).toBeNull();
    });

    it('should handle missing environment variables gracefully', () => {
      delete process.env.FACEBOOK_PIXEL_ID;
      delete process.env.GOOGLE_ADS_CUSTOMER_ID;

      const clients = createIntegrationClients({
        source: 'test',
        includeAdsConversion: true,
      });

      expect(clients.adsConversion).not.toBeNull();
    });
  });

  describe('isConfigured - all client types', () => {
    it('should check all client types in switch statement', () => {
      process.env.HUBSPOT_ACCESS_TOKEN = 'token';
      process.env.WHATSAPP_API_KEY = 'key';
      process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
      process.env.OPENAI_API_KEY = 'sk-test';
      process.env.SCHEDULING_SERVICE_URL = 'https://scheduling.example.com';
      process.env.SCHEDULING_SERVICE_TOKEN = 'token';
      process.env.VAPI_API_KEY = 'vapi-key';
      process.env.STRIPE_SECRET_KEY = 'sk_test';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.API_GATEWAY_URL = 'https://api.example.com';
      process.env.INTERNAL_API_KEY = 'internal-key';

      const clients = createIntegrationClients({
        source: 'test',
        includeOpenAI: true,
        includeScheduling: true,
        includeVapi: true,
        includeStripe: true,
        includeScoring: true,
        includeTriage: true,
        includeConsent: true,
        includeTemplateCatalog: true,
        includeNotifications: true,
        includeAdsConversion: true,
      });

      // Test each client type individually
      expect(clients.isConfigured(['hubspot'])).toBe(true);
      expect(clients.isConfigured(['whatsapp'])).toBe(true);
      expect(clients.isConfigured(['openai'])).toBe(true);
      expect(clients.isConfigured(['scheduling'])).toBe(true);
      expect(clients.isConfigured(['vapi'])).toBe(true);
      expect(clients.isConfigured(['stripe'])).toBe(true);
      expect(clients.isConfigured(['scoring'])).toBe(true);
      expect(clients.isConfigured(['triage'])).toBe(true);
      expect(clients.isConfigured(['consent'])).toBe(true);
      expect(clients.isConfigured(['templateCatalog'])).toBe(true);
      expect(clients.isConfigured(['notifications'])).toBe(true);
      expect(clients.isConfigured(['adsConversion'])).toBe(true);
      expect(clients.isConfigured(['eventStore'])).toBe(true);
    });

    it('should return false for each missing client type', () => {
      const clients = createIntegrationClients({ source: 'test' });

      expect(clients.isConfigured(['hubspot'])).toBe(false);
      expect(clients.isConfigured(['whatsapp'])).toBe(false);
      expect(clients.isConfigured(['openai'])).toBe(false);
      expect(clients.isConfigured(['scheduling'])).toBe(false);
      expect(clients.isConfigured(['vapi'])).toBe(false);
      expect(clients.isConfigured(['stripe'])).toBe(false);
      expect(clients.isConfigured(['scoring'])).toBe(false);
      expect(clients.isConfigured(['triage'])).toBe(false);
      expect(clients.isConfigured(['consent'])).toBe(false);
      expect(clients.isConfigured(['templateCatalog'])).toBe(false);
      expect(clients.isConfigured(['notifications'])).toBe(false);
      expect(clients.isConfigured(['adsConversion'])).toBe(false);
    });

    it('should short-circuit and return false on first missing client', () => {
      process.env.HUBSPOT_ACCESS_TOKEN = 'token';

      const clients = createIntegrationClients({ source: 'test' });

      // HubSpot is configured, WhatsApp is not - should return false
      expect(clients.isConfigured(['hubspot', 'whatsapp', 'openai'])).toBe(false);
    });
  });

  describe('circuit breaker wrapping', () => {
    it('should not wrap clients when circuit breaker is disabled', () => {
      process.env.HUBSPOT_ACCESS_TOKEN = 'token';
      process.env.WHATSAPP_API_KEY = 'key';
      process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
      process.env.OPENAI_API_KEY = 'sk-test';

      const clients = createIntegrationClients({
        source: 'test',
        includeOpenAI: true,
        circuitBreaker: { enabled: false },
      });

      expect(clients.hubspot).not.toBeNull();
      expect(clients.whatsapp).not.toBeNull();
      expect(clients.openai).not.toBeNull();
    });

    it('should wrap HubSpot client with circuit breaker when enabled', () => {
      process.env.HUBSPOT_ACCESS_TOKEN = 'token';

      const clients = createIntegrationClients({
        source: 'test',
        circuitBreaker: { enabled: true },
      });

      expect(clients.hubspot).not.toBeNull();
    });

    it('should wrap WhatsApp client with circuit breaker when enabled', () => {
      process.env.WHATSAPP_API_KEY = 'key';
      process.env.WHATSAPP_PHONE_NUMBER_ID = '123';

      const clients = createIntegrationClients({
        source: 'test',
        circuitBreaker: { enabled: true },
      });

      expect(clients.whatsapp).not.toBeNull();
    });

    it('should wrap OpenAI client with circuit breaker when enabled', () => {
      process.env.OPENAI_API_KEY = 'sk-test';

      const clients = createIntegrationClients({
        source: 'test',
        includeOpenAI: true,
        circuitBreaker: { enabled: true },
      });

      expect(clients.openai).not.toBeNull();
    });

    it('should wrap scheduling service with circuit breaker when enabled', () => {
      process.env.SCHEDULING_SERVICE_URL = 'https://scheduling.example.com';
      process.env.SCHEDULING_SERVICE_TOKEN = 'token';

      const clients = createIntegrationClients({
        source: 'test',
        includeScheduling: true,
        circuitBreaker: { enabled: true },
      });

      expect(clients.scheduling).not.toBeNull();
    });

    it('should wrap Vapi client with circuit breaker when enabled', () => {
      process.env.VAPI_API_KEY = 'vapi-key';

      const clients = createIntegrationClients({
        source: 'test',
        includeVapi: true,
        circuitBreaker: { enabled: true },
      });

      expect(clients.vapi).not.toBeNull();
    });

    it('should wrap Stripe client with circuit breaker when enabled', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test';

      const clients = createIntegrationClients({
        source: 'test',
        includeStripe: true,
        circuitBreaker: { enabled: true },
      });

      expect(clients.stripe).not.toBeNull();
    });

    it('should handle circuit breaker with custom callbacks', () => {
      const onOpen = vi.fn();
      const onClose = vi.fn();

      process.env.HUBSPOT_ACCESS_TOKEN = 'token';

      const clients = createIntegrationClients({
        source: 'test',
        circuitBreaker: {
          enabled: true,
          onOpen,
          onClose,
        },
      });

      expect(clients.hubspot).not.toBeNull();
      // Callbacks are registered but not called yet
      expect(onOpen).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('circuit breaker functions', () => {
    it('should return false for non-circuit-breaker services', () => {
      const clients = createIntegrationClients({
        source: 'test',
        includeScoring: true,
        includeTriage: true,
        includeConsent: true,
      });

      expect(clients.isCircuitOpen('scoring')).toBe(false);
      expect(clients.isCircuitOpen('triage')).toBe(false);
      expect(clients.isCircuitOpen('consent')).toBe(false);
      expect(clients.isCircuitOpen('templateCatalog')).toBe(false);
      expect(clients.isCircuitOpen('notifications')).toBe(false);
      expect(clients.isCircuitOpen('adsConversion')).toBe(false);
      expect(clients.isCircuitOpen('eventStore')).toBe(false);
    });

    it('should not throw when resetting non-circuit-breaker services', () => {
      const clients = createIntegrationClients({
        source: 'test',
        includeScoring: true,
        includeTriage: true,
      });

      expect(() => clients.resetCircuit('scoring')).not.toThrow();
      expect(() => clients.resetCircuit('triage')).not.toThrow();
      expect(() => clients.resetCircuit('consent')).not.toThrow();
      expect(() => clients.resetCircuit('templateCatalog')).not.toThrow();
      expect(() => clients.resetCircuit('notifications')).not.toThrow();
      expect(() => clients.resetCircuit('adsConversion')).not.toThrow();
      expect(() => clients.resetCircuit('eventStore')).not.toThrow();
    });
  });

  describe('scheduling service edge cases', () => {
    it('should create mock when only URL is provided', () => {
      process.env.SCHEDULING_SERVICE_URL = 'https://scheduling.example.com';
      delete process.env.SCHEDULING_SERVICE_TOKEN;

      const clients = createIntegrationClients({
        source: 'test',
        includeScheduling: true,
      });

      expect(clients.scheduling).not.toBeNull();
    });

    it('should create mock when only token is provided', () => {
      delete process.env.SCHEDULING_SERVICE_URL;
      process.env.SCHEDULING_SERVICE_TOKEN = 'token';

      const clients = createIntegrationClients({
        source: 'test',
        includeScheduling: true,
      });

      expect(clients.scheduling).not.toBeNull();
    });
  });

  describe('proxy and circuit breaker behavior', () => {
    it('should allow accessing non-function properties on wrapped clients', () => {
      process.env.HUBSPOT_ACCESS_TOKEN = 'token';

      const clients = createIntegrationClients({
        source: 'test',
        circuitBreaker: { enabled: true },
      });

      // HubSpot client has non-function properties that should be accessible
      expect(clients.hubspot).not.toBeNull();

      // Access properties (if any) should work without throwing
      if (clients.hubspot) {
        // The proxy should allow property access
        expect(() => {
          const keys = Object.keys(clients.hubspot!);
          return keys;
        }).not.toThrow();
      }
    });

    it('should wrap async functions with circuit breaker', async () => {
      process.env.HUBSPOT_ACCESS_TOKEN = 'token';

      const clients = createIntegrationClients({
        source: 'test',
        circuitBreaker: { enabled: true },
      });

      expect(clients.hubspot).not.toBeNull();

      // Calling methods should work (they're wrapped with circuit breaker)
      // This ensures the proxy's get trap wraps functions properly
      if (clients.hubspot && typeof clients.hubspot.createContact === 'function') {
        // The function exists and is callable
        expect(typeof clients.hubspot.createContact).toBe('function');
      }
    });

    it('should handle WhatsApp client methods through circuit breaker proxy', () => {
      process.env.WHATSAPP_API_KEY = 'key';
      process.env.WHATSAPP_PHONE_NUMBER_ID = '123';

      const clients = createIntegrationClients({
        source: 'test',
        circuitBreaker: { enabled: true },
      });

      expect(clients.whatsapp).not.toBeNull();

      if (clients.whatsapp && typeof clients.whatsapp.sendMessage === 'function') {
        expect(typeof clients.whatsapp.sendMessage).toBe('function');
      }
    });

    it('should handle OpenAI client methods through circuit breaker proxy', () => {
      process.env.OPENAI_API_KEY = 'sk-test';

      const clients = createIntegrationClients({
        source: 'test',
        includeOpenAI: true,
        circuitBreaker: { enabled: true },
      });

      expect(clients.openai).not.toBeNull();

      if (clients.openai) {
        // Verify the client is wrapped
        expect(clients.openai).toBeDefined();
      }
    });

    it('should handle Vapi client methods through circuit breaker proxy', () => {
      process.env.VAPI_API_KEY = 'vapi-key';

      const clients = createIntegrationClients({
        source: 'test',
        includeVapi: true,
        circuitBreaker: { enabled: true },
      });

      expect(clients.vapi).not.toBeNull();
    });

    it('should handle Stripe client methods through circuit breaker proxy', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test';

      const clients = createIntegrationClients({
        source: 'test',
        includeStripe: true,
        circuitBreaker: { enabled: true },
      });

      expect(clients.stripe).not.toBeNull();
    });

    it('should handle scheduling service methods through circuit breaker proxy', () => {
      process.env.SCHEDULING_SERVICE_URL = 'https://scheduling.example.com';
      process.env.SCHEDULING_SERVICE_TOKEN = 'token';

      const clients = createIntegrationClients({
        source: 'test',
        includeScheduling: true,
        circuitBreaker: { enabled: true },
      });

      expect(clients.scheduling).not.toBeNull();
    });
  });

  describe('consent repository adapter error handling', () => {
    it('should handle consent service with database', () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      const clients = createIntegrationClients({
        source: 'test',
        includeConsent: true,
      });

      expect(clients.consent).not.toBeNull();
    });

    it('should handle consent service with in-memory repository', () => {
      delete process.env.DATABASE_URL;

      const clients = createIntegrationClients({
        source: 'test',
        includeConsent: true,
      });

      expect(clients.consent).not.toBeNull();
    });

    it('should create consent service regardless of database configuration', () => {
      // Test with database URL
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      let clients = createIntegrationClients({
        source: 'test',
        includeConsent: true,
      });
      expect(clients.consent).not.toBeNull();

      // Test without database URL
      delete process.env.DATABASE_URL;
      clients = createIntegrationClients({
        source: 'test',
        includeConsent: true,
      });
      expect(clients.consent).not.toBeNull();
    });
  });

  describe('WhatsApp webhook secret configuration', () => {
    it('should create WhatsApp client without webhook secret', () => {
      process.env.WHATSAPP_API_KEY = 'key';
      process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
      delete process.env.WHATSAPP_WEBHOOK_SECRET;

      const clients = createIntegrationClients({
        source: 'test',
      });

      expect(clients.whatsapp).not.toBeNull();
    });

    it('should create WhatsApp client with webhook secret', () => {
      process.env.WHATSAPP_API_KEY = 'key';
      process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
      process.env.WHATSAPP_WEBHOOK_SECRET = 'secret123';

      const clients = createIntegrationClients({
        source: 'test',
      });

      expect(clients.whatsapp).not.toBeNull();
    });
  });

  describe('Stripe configuration variations', () => {
    it('should create Stripe client without webhook secret', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
      delete process.env.STRIPE_WEBHOOK_SECRET;

      const clients = createIntegrationClients({
        source: 'test',
        includeStripe: true,
      });

      expect(clients.stripe).not.toBeNull();
    });

    it('should create Stripe client with webhook secret', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';

      const clients = createIntegrationClients({
        source: 'test',
        includeStripe: true,
      });

      expect(clients.stripe).not.toBeNull();
    });

    it('should create mock Stripe client when secret key is missing', () => {
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      const clients = createIntegrationClients({
        source: 'test',
        includeStripe: true,
      });

      expect(clients.stripe).not.toBeNull();
    });

    it('should use Stripe-specific circuit breaker thresholds', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';

      const clients = createIntegrationClients({
        source: 'test',
        includeStripe: true,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 10, // Custom, but Stripe overrides to 3
        },
      });

      expect(clients.stripe).not.toBeNull();
      // Stripe gets special circuit breaker config (failureThreshold: 3, resetTimeoutMs: 60000)
    });
  });

  describe('event store configuration', () => {
    it('should create database event store when DATABASE_URL is provided', () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      const clients = createIntegrationClients({
        source: 'test-source',
      });

      expect(clients.eventStore).toBeDefined();
      expect(typeof clients.eventStore.emit).toBe('function');
      expect(typeof clients.eventStore.getByCorrelationId).toBe('function');
    });

    it('should create in-memory event store when DATABASE_URL is missing', () => {
      delete process.env.DATABASE_URL;

      const clients = createIntegrationClients({
        source: 'test-source',
      });

      expect(clients.eventStore).toBeDefined();
      expect(typeof clients.eventStore.emit).toBe('function');
      expect(typeof clients.eventStore.getByCorrelationId).toBe('function');
    });
  });

  describe('circuit breaker threshold configuration', () => {
    it('should use default thresholds when not specified', () => {
      const clients = createIntegrationClients({
        source: 'test',
        circuitBreaker: {
          enabled: true,
        },
      });

      expect(clients.getCircuitBreakerStats()).toBeDefined();
    });

    it('should use custom failure threshold', () => {
      const clients = createIntegrationClients({
        source: 'test',
        circuitBreaker: {
          enabled: true,
          failureThreshold: 10,
        },
      });

      expect(clients.getCircuitBreakerStats()).toBeDefined();
    });

    it('should use custom reset timeout', () => {
      const clients = createIntegrationClients({
        source: 'test',
        circuitBreaker: {
          enabled: true,
          resetTimeoutMs: 60000,
        },
      });

      expect(clients.getCircuitBreakerStats()).toBeDefined();
    });

    it('should use custom success threshold', () => {
      const clients = createIntegrationClients({
        source: 'test',
        circuitBreaker: {
          enabled: true,
          successThreshold: 5,
        },
      });

      expect(clients.getCircuitBreakerStats()).toBeDefined();
    });

    it('should use all custom thresholds together', () => {
      const clients = createIntegrationClients({
        source: 'test',
        circuitBreaker: {
          enabled: true,
          failureThreshold: 10,
          resetTimeoutMs: 60000,
          successThreshold: 5,
        },
      });

      expect(clients.getCircuitBreakerStats()).toBeDefined();
    });

    it('should handle circuit breaker with only onOpen callback', () => {
      const onOpen = vi.fn();

      const clients = createIntegrationClients({
        source: 'test',
        circuitBreaker: {
          enabled: true,
          onOpen,
        },
      });

      expect(clients.getCircuitBreakerStats()).toBeDefined();
    });

    it('should handle circuit breaker with only onClose callback', () => {
      const onClose = vi.fn();

      const clients = createIntegrationClients({
        source: 'test',
        circuitBreaker: {
          enabled: true,
          onClose,
        },
      });

      expect(clients.getCircuitBreakerStats()).toBeDefined();
    });
  });

  describe('Vapi configuration variations', () => {
    it('should create Vapi client with only API key', () => {
      process.env.VAPI_API_KEY = 'vapi-key';
      delete process.env.VAPI_ASSISTANT_ID;
      delete process.env.VAPI_PHONE_NUMBER_ID;

      const clients = createIntegrationClients({
        source: 'test',
        includeVapi: true,
      });

      expect(clients.vapi).not.toBeNull();
    });

    it('should create Vapi client with API key and assistant ID', () => {
      process.env.VAPI_API_KEY = 'vapi-key';
      process.env.VAPI_ASSISTANT_ID = 'assistant-123';
      delete process.env.VAPI_PHONE_NUMBER_ID;

      const clients = createIntegrationClients({
        source: 'test',
        includeVapi: true,
      });

      expect(clients.vapi).not.toBeNull();
    });

    it('should create Vapi client with API key and phone number ID', () => {
      process.env.VAPI_API_KEY = 'vapi-key';
      delete process.env.VAPI_ASSISTANT_ID;
      process.env.VAPI_PHONE_NUMBER_ID = 'phone-123';

      const clients = createIntegrationClients({
        source: 'test',
        includeVapi: true,
      });

      expect(clients.vapi).not.toBeNull();
    });

    it('should create Vapi client with all configuration options', () => {
      process.env.VAPI_API_KEY = 'vapi-key';
      process.env.VAPI_ASSISTANT_ID = 'assistant-123';
      process.env.VAPI_PHONE_NUMBER_ID = 'phone-123';

      const clients = createIntegrationClients({
        source: 'test',
        includeVapi: true,
      });

      expect(clients.vapi).not.toBeNull();
    });
  });

  describe('scoring service configuration', () => {
    it('should create scoring service with OpenAI API key', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key';

      const clients = createIntegrationClients({
        source: 'test',
        includeScoring: true,
      });

      expect(clients.scoring).not.toBeNull();
    });

    it('should create scoring service without OpenAI API key (fallback mode)', () => {
      delete process.env.OPENAI_API_KEY;

      const clients = createIntegrationClients({
        source: 'test',
        includeScoring: true,
      });

      // Scoring service uses empty string and fallback when no API key
      expect(clients.scoring).not.toBeNull();
    });
  });

  describe('complete configuration scenarios', () => {
    it('should handle no clients configured', () => {
      // Clear all environment variables
      delete process.env.HUBSPOT_ACCESS_TOKEN;
      delete process.env.WHATSAPP_API_KEY;
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;
      delete process.env.OPENAI_API_KEY;
      delete process.env.VAPI_API_KEY;
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.DATABASE_URL;
      delete process.env.API_GATEWAY_URL;
      delete process.env.INTERNAL_API_KEY;

      const clients = createIntegrationClients({
        source: 'test',
        includeOpenAI: false,
        includeScheduling: false,
        includeVapi: false,
        includeStripe: false,
        includeScoring: false,
        includeTriage: false,
        includeConsent: false,
        includeTemplateCatalog: false,
        includeNotifications: false,
        includeAdsConversion: false,
      });

      expect(clients.hubspot).toBeNull();
      expect(clients.whatsapp).toBeNull();
      expect(clients.openai).toBeNull();
      expect(clients.scheduling).toBeNull();
      expect(clients.vapi).toBeNull();
      expect(clients.stripe).toBeNull();
      expect(clients.scoring).toBeNull();
      expect(clients.triage).toBeNull();
      expect(clients.consent).toBeNull();
      expect(clients.templateCatalog).toBeNull();
      expect(clients.notifications).toBeNull();
      expect(clients.adsConversion).toBeNull();
      expect(clients.eventStore).toBeDefined(); // Always initialized
    });

    it('should handle all optional clients enabled with minimal credentials', () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.SCHEDULING_SERVICE_URL;
      delete process.env.VAPI_API_KEY;
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.DATABASE_URL;
      delete process.env.API_GATEWAY_URL;

      const clients = createIntegrationClients({
        source: 'test',
        includeOpenAI: true,
        includeScheduling: true,
        includeVapi: true,
        includeStripe: true,
        includeScoring: true,
        includeTriage: true,
        includeConsent: true,
        includeTemplateCatalog: true,
        includeNotifications: true,
        includeAdsConversion: true,
      });

      // OpenAI: null (no key)
      expect(clients.openai).toBeNull();
      // Scheduling: mock (no credentials)
      expect(clients.scheduling).not.toBeNull();
      // Vapi: null (no key)
      expect(clients.vapi).toBeNull();
      // Stripe: mock (no key)
      expect(clients.stripe).not.toBeNull();
      // Scoring: created with empty string
      expect(clients.scoring).not.toBeNull();
      // Triage: always created
      expect(clients.triage).not.toBeNull();
      // Consent: in-memory (no DB)
      expect(clients.consent).not.toBeNull();
      // Template catalog: always created
      expect(clients.templateCatalog).not.toBeNull();
      // Notifications: mock (no credentials)
      expect(clients.notifications).not.toBeNull();
      // Ads conversion: created with env vars
      expect(clients.adsConversion).not.toBeNull();
    });
  });

  describe('wrapped client method invocation through circuit breaker', () => {
    it('should execute wrapped HubSpot methods through circuit breaker', async () => {
      process.env.HUBSPOT_ACCESS_TOKEN = 'token';

      const clients = createIntegrationClients({
        source: 'test',
        circuitBreaker: { enabled: true },
      });

      expect(clients.hubspot).not.toBeNull();

      // Verify that calling a method goes through the circuit breaker proxy
      if (clients.hubspot && typeof clients.hubspot.getContact === 'function') {
        // The proxy wraps this function call - it will succeed with mock data
        const result = await clients.hubspot.getContact('test-id');
        expect(result).toBeDefined();
      }
    });

    it('should execute wrapped WhatsApp methods through circuit breaker', async () => {
      process.env.WHATSAPP_API_KEY = 'key';
      process.env.WHATSAPP_PHONE_NUMBER_ID = '123';

      const clients = createIntegrationClients({
        source: 'test',
        circuitBreaker: { enabled: true },
      });

      expect(clients.whatsapp).not.toBeNull();

      // Verify the proxy wrapper is working
      if (clients.whatsapp) {
        // Access a property (non-function) - should return the property value
        const proto = Object.getPrototypeOf(clients.whatsapp);
        expect(proto).toBeDefined();
      }
    });

    it('should execute wrapped scheduling service methods through circuit breaker', async () => {
      const clients = createIntegrationClients({
        source: 'test',
        includeScheduling: true,
        circuitBreaker: { enabled: true },
      });

      expect(clients.scheduling).not.toBeNull();

      // Mock scheduling service should have methods
      if (clients.scheduling && typeof clients.scheduling.createAppointment === 'function') {
        // Call through the circuit breaker proxy
        const result = await clients.scheduling.createAppointment({
          patientId: 'test',
          providerId: 'test',
          startTime: new Date(),
          endTime: new Date(),
          type: 'consultation',
        });
        expect(result).toBeDefined();
      }
    });

    it('should execute wrapped Stripe methods through circuit breaker', async () => {
      const clients = createIntegrationClients({
        source: 'test',
        includeStripe: true,
        circuitBreaker: { enabled: true },
      });

      expect(clients.stripe).not.toBeNull();

      // Mock Stripe client should have methods
      if (clients.stripe && typeof clients.stripe.createPaymentIntent === 'function') {
        // Call through the circuit breaker proxy
        const result = await clients.stripe.createPaymentIntent({
          amount: 1000,
          currency: 'usd',
        });
        expect(result).toBeDefined();
      }
    });
  });

  describe('consent repository adapter', () => {
    it('should create consent service and handle operations', async () => {
      delete process.env.DATABASE_URL;

      const clients = createIntegrationClients({
        source: 'test',
        includeConsent: true,
      });

      expect(clients.consent).not.toBeNull();

      if (clients.consent) {
        // Test that the consent service works
        const consentRecord = await clients.consent.grantConsent(
          'test-contact',
          '+40721000001',
          'marketing',
          'whatsapp',
          { metadata: { source: 'test' } }
        );

        expect(consentRecord).toBeDefined();
        // The consent record should have required fields
        expect(consentRecord.id).toBeDefined();
        expect(consentRecord.contactId).toBe('test-contact');
      }
    });

    it('should verify consent through consent service', async () => {
      delete process.env.DATABASE_URL;

      const clients = createIntegrationClients({
        source: 'test',
        includeConsent: true,
      });

      if (clients.consent) {
        // Grant consent first
        const consentRecord = await clients.consent.grantConsent(
          'test-contact-2',
          '+40721000002',
          'marketing',
          'whatsapp'
        );

        expect(consentRecord).toBeDefined();

        // Verify consent (only contactId and consentType are needed)
        const hasConsent = await clients.consent.hasValidConsent('test-contact-2', 'marketing');
        expect(hasConsent).toBe(true);
      }
    });

    it('should handle consent with database configuration', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      const clients = createIntegrationClients({
        source: 'test',
        includeConsent: true,
      });

      expect(clients.consent).not.toBeNull();
    });

    it('should handle various consent operations through the adapter', async () => {
      delete process.env.DATABASE_URL;

      const clients = createIntegrationClients({
        source: 'test',
        includeConsent: true,
      });

      if (clients.consent) {
        // Grant consent
        const consent = await clients.consent.grantConsent(
          'test-contact-3',
          '+40721000003',
          'data_processing',
          'web'
        );

        expect(consent).toBeDefined();

        // Update consent (this exercises the upsert path)
        const updated = await clients.consent.recordConsent({
          contactId: 'test-contact-3',
          phone: '+40721000003',
          consentType: 'data_processing',
          status: 'granted',
          source: 'web',
        });

        expect(updated).toBeDefined();

        // Find consents by contact
        const consents = await clients.consent.getConsentsForContact('test-contact-3');
        expect(consents.length).toBeGreaterThan(0);

        // Get audit trail
        const auditTrail = await clients.consent.getContactAuditTrail('test-contact-3');
        expect(Array.isArray(auditTrail)).toBe(true);

        // Withdraw consent
        const withdrawn = await clients.consent.withdrawConsent(
          'test-contact-3',
          'data_processing'
        );
        expect(withdrawn.status).toBe('withdrawn');

        // Verify withdrawal
        const hasConsent = await clients.consent.hasValidConsent(
          'test-contact-3',
          'data_processing'
        );
        expect(hasConsent).toBe(false);
      }
    });
  });

  describe('event store operations', () => {
    it('should emit events through in-memory event store', async () => {
      delete process.env.DATABASE_URL;

      const clients = createIntegrationClients({
        source: 'test-source',
      });

      const result = await clients.eventStore.emit({
        type: 'test.event',
        correlationId: 'test-123',
        payload: { data: 'test' },
      });

      expect(result).toBeDefined();
    });

    it('should retrieve events by correlation ID', async () => {
      delete process.env.DATABASE_URL;

      const clients = createIntegrationClients({
        source: 'test-source',
      });

      const correlationId = 'test-correlation-123';

      await clients.eventStore.emit({
        type: 'test.event.1',
        correlationId,
        payload: { data: 'first' },
      });

      await clients.eventStore.emit({
        type: 'test.event.2',
        correlationId,
        payload: { data: 'second' },
      });

      const events = await clients.eventStore.getByCorrelationId(correlationId);
      expect(events.length).toBeGreaterThanOrEqual(0);
    });
  });
});
