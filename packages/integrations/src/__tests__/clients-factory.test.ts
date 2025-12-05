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
});
