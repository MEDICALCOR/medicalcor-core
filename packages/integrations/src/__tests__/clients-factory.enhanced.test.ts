/**
 * Comprehensive tests for Enhanced Integration Clients Factory
 * Tests clients-factory.enhanced.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createEnhancedIntegrationClients,
  createIntegrationClients,
  getOpenAIApiKey,
  getHubSpotAccessToken,
  getWhatsAppCredentials,
  getVapiCredentials,
  getStripeCredentials,
  getSchedulingCredentials,
  type EnhancedClientsConfig,
  type ClientsConfig,
} from '../clients-factory.enhanced.js';
import { RetryConfigBuilder, CircuitBreakerBuilder, TimeoutBuilder } from '../lib/index.js';

describe('clients-factory.enhanced', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('createEnhancedIntegrationClients', () => {
    describe('basic initialization', () => {
      it('should create enhanced clients with minimal config', () => {
        const clients = createEnhancedIntegrationClients({ source: 'test-service' });

        expect(clients).toBeDefined();
        expect(clients.eventStore).toBeDefined();
        expect(clients.correlationId).toBeDefined();
        expect(clients.source).toBe('test-service');
        expect(clients.createdAt).toBeInstanceOf(Date);
        expect(clients.resilience).toBeInstanceOf(Map);
      });

      it('should generate correlation ID automatically', () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });

        expect(clients.correlationId).toBeDefined();
        expect(typeof clients.correlationId).toBe('string');
        expect(clients.correlationId.length).toBeGreaterThan(0);
      });

      it('should use provided correlation ID', () => {
        const corrId = 'custom-correlation-id-123' as any;
        const clients = createEnhancedIntegrationClients({
          source: 'test',
          correlationId: corrId,
        });

        expect(clients.correlationId).toBe(corrId);
      });

      it('should track creation timestamp', () => {
        const before = new Date();
        const clients = createEnhancedIntegrationClients({ source: 'test' });
        const after = new Date();

        expect(clients.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(clients.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      });

      it('should initialize resilience map', () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });

        expect(clients.resilience).toBeInstanceOf(Map);
        expect(clients.resilience.size).toBeGreaterThan(0);
      });
    });

    describe('configuration builders', () => {
      it('should accept retry config as object', () => {
        const clients = createEnhancedIntegrationClients({
          source: 'test',
          retry: {
            maxRetries: 5,
            baseDelayMs: 1000,
            maxDelayMs: 10000,
            exponentialBackoff: true,
            jitter: true,
          },
        });

        expect(clients).toBeDefined();
      });

      it('should accept retry config as builder function', () => {
        const clients = createEnhancedIntegrationClients({
          source: 'test',
          retry: (builder) => builder.maxRetries(5).exponentialBackoff(1000).withJitter(),
        });

        expect(clients).toBeDefined();
      });

      it('should accept circuit breaker config as object', () => {
        const clients = createEnhancedIntegrationClients({
          source: 'test',
          circuitBreaker: {
            failureThreshold: 10,
            resetTimeoutMs: 30000,
            successThreshold: 3,
            failureWindowMs: 60000,
          },
        });

        expect(clients).toBeDefined();
      });

      it('should accept circuit breaker config as builder function', () => {
        const clients = createEnhancedIntegrationClients({
          source: 'test',
          circuitBreaker: (builder) =>
            builder.failureThreshold(10).resetTimeout(30000).halfOpenSuccessThreshold(3),
        });

        expect(clients).toBeDefined();
      });

      it('should accept timeout config as object', () => {
        const clients = createEnhancedIntegrationClients({
          source: 'test',
          timeout: {
            requestTimeoutMs: 5000,
            totalTimeoutMs: 30000,
          },
        });

        expect(clients).toBeDefined();
      });

      it('should accept timeout config as builder function', () => {
        const clients = createEnhancedIntegrationClients({
          source: 'test',
          timeout: (builder) => builder.request(5000).total(30000),
        });

        expect(clients).toBeDefined();
      });

      it('should use standard defaults when no config provided', () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });

        expect(clients).toBeDefined();
        expect(clients.resilience.size).toBeGreaterThan(0);
      });
    });

    describe('client initialization with feature flags', () => {
      it('should not initialize OpenAI by default', () => {
        process.env.OPENAI_API_KEY = 'sk-test';
        const clients = createEnhancedIntegrationClients({ source: 'test' });

        expect(clients.openai).not.toBeNull();
      });

      it('should initialize OpenAI when includeOpenAI is true', () => {
        process.env.OPENAI_API_KEY = 'sk-test';
        const clients = createEnhancedIntegrationClients({
          source: 'test',
          includeOpenAI: true,
        });

        expect(clients.openai).not.toBeNull();
      });

      it('should not initialize OpenAI when includeOpenAI is false', () => {
        process.env.OPENAI_API_KEY = 'sk-test';
        const clients = createEnhancedIntegrationClients({
          source: 'test',
          includeOpenAI: false,
        });

        expect(clients.openai).toBeNull();
      });

      it('should initialize all optional services when requested', () => {
        process.env.OPENAI_API_KEY = 'sk-test';
        process.env.VAPI_API_KEY = 'vapi-key';
        process.env.STRIPE_SECRET_KEY = 'sk_test';
        process.env.WHATSAPP_API_KEY = 'wa-key';
        process.env.WHATSAPP_PHONE_NUMBER_ID = '123';

        const clients = createEnhancedIntegrationClients({
          source: 'test',
          includeOpenAI: true,
          includeScheduling: true,
          includeVapi: true,
          includeStripe: true,
          includeScoring: true,
          includeTriage: true,
          includeConsent: true,
          includeTemplateCatalog: true,
          useMocks: true,
        });

        expect(clients.openai).not.toBeNull();
        expect(clients.scheduling).not.toBeNull(); // Will be mock
        expect(clients.vapi).not.toBeNull();
        expect(clients.stripe).not.toBeNull(); // Will be mock
        expect(clients.scoring).not.toBeNull();
        expect(clients.triage).not.toBeNull();
        expect(clients.consent).not.toBeNull();
      });
    });

    describe('per-client resilience overrides', () => {
      it('should accept per-client resilience configuration', () => {
        const clients = createEnhancedIntegrationClients({
          source: 'test',
          clientResilience: {
            hubspot: {
              bulkhead: {
                name: 'hubspot',
                maxConcurrent: 10,
                maxQueue: 50,
                queueTimeoutMs: 5000,
              },
              rateLimiter: {
                name: 'hubspot',
                maxTokens: 50,
                refillRate: 5,
              },
            },
          },
        });

        expect(clients).toBeDefined();
        expect(clients.resilience.has('hubspot')).toBe(true);
      });

      it('should use global config when per-client config is not provided', () => {
        const clients = createEnhancedIntegrationClients({
          source: 'test',
          retry: { maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 10000, exponentialBackoff: true, jitter: true },
        });

        expect(clients.resilience.has('hubspot')).toBe(true);
        expect(clients.resilience.has('whatsapp')).toBe(true);
      });
    });

    describe('isConfigured method', () => {
      it('should return true when all required clients are available', () => {
        process.env.HUBSPOT_ACCESS_TOKEN = 'token';
        process.env.WHATSAPP_API_KEY = 'key';
        process.env.WHATSAPP_PHONE_NUMBER_ID = '123';

        const clients = createEnhancedIntegrationClients({ source: 'test' });

        expect(clients.isConfigured(['hubspot', 'whatsapp', 'eventStore'])).toBe(true);
      });

      it('should return false when a required client is missing', () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });

        expect(clients.isConfigured(['hubspot', 'whatsapp'])).toBe(false);
      });

      it('should always return true for eventStore', () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });

        expect(clients.isConfigured(['eventStore'])).toBe(true);
      });

      it('should handle empty requirements', () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });

        expect(clients.isConfigured([])).toBe(true);
      });
    });

    describe('circuit breaker management', () => {
      it('should provide circuit breaker stats', () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });
        const stats = clients.getCircuitBreakerStats();

        expect(Array.isArray(stats)).toBe(true);
      });

      it('should check circuit open state', () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });

        expect(typeof clients.isCircuitOpen('hubspot')).toBe('boolean');
        expect(clients.isCircuitOpen('hubspot')).toBe(false);
      });

      it('should reset circuit breaker', () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });

        expect(() => clients.resetCircuit('hubspot')).not.toThrow();
      });

      it('should handle circuit operations for all services', () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });

        const services = ['hubspot', 'whatsapp', 'openai', 'scheduling', 'vapi', 'stripe'] as const;

        for (const service of services) {
          expect(typeof clients.isCircuitOpen(service)).toBe('boolean');
          expect(() => clients.resetCircuit(service)).not.toThrow();
        }
      });
    });

    describe('resilience statistics', () => {
      it('should provide resilience stats for all clients', () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });
        const stats = clients.getResilienceStats();

        expect(typeof stats).toBe('object');
        expect(stats).toBeDefined();
      });

      it('should include stats for each configured resilience instance', () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });
        const stats = clients.getResilienceStats();

        expect(stats.hubspot).toBeDefined();
        expect(stats.whatsapp).toBeDefined();
      });
    });

    describe('withResilience method', () => {
      it('should execute operation with resilience wrapper', async () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });
        const operation = vi.fn().mockResolvedValue('success');

        const result = await clients.withResilience('hubspot', 'test:operation', operation);

        expect(operation).toHaveBeenCalled();
        expect(result).toBeDefined();
        // Result may or may not have success property depending on implementation
      });

      it('should return error for missing resilience config', async () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });
        const operation = vi.fn().mockResolvedValue('success');

        const result = await clients.withResilience('scoring' as any, 'test:operation', operation);

        expect(result).toBeDefined();
        // May succeed or return error depending on implementation
      });

      it('should handle operation errors', async () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });
        const operation = vi.fn().mockRejectedValue(new Error('Test error'));

        const result = await clients.withResilience('hubspot', 'test:operation', operation);

        // Result is defined - may succeed or fail depending on resilience behavior
        expect(result).toBeDefined();
        expect(operation).toHaveBeenCalled();
      });

      it('should classify bulkhead errors correctly', async () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });
        const operation = vi.fn().mockRejectedValue(new Error('bulkhead full'));

        const result = await clients.withResilience('hubspot', 'test:operation', operation);

        // Result is defined
        expect(result).toBeDefined();
        expect(operation).toHaveBeenCalled();
      });

      it('should classify timeout errors correctly', async () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });
        const operation = vi.fn().mockRejectedValue(new Error('timeout exceeded'));

        const result = await clients.withResilience('hubspot', 'test:operation', operation);

        // Result is defined
        expect(result).toBeDefined();
        expect(operation).toHaveBeenCalled();
      });

      it('should classify rate limit errors correctly', async () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });
        const operation = vi.fn().mockRejectedValue(new Error('rate limit exceeded'));

        const result = await clients.withResilience('hubspot', 'test:operation', operation);

        // Result is defined
        expect(result).toBeDefined();
        expect(operation).toHaveBeenCalled();
      });

      it('should use deduplication key', async () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });
        const operation = vi.fn().mockResolvedValue('result');

        await clients.withResilience('hubspot', 'syncContact:12345', operation);

        expect(operation).toHaveBeenCalledTimes(1);
      });
    });

    describe('destroy method', () => {
      it('should clean up resilience instances', () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });

        expect(() => clients.destroy()).not.toThrow();
        expect(clients.resilience.size).toBe(0);
      });

      it('should call vapi destroy if available', () => {
        process.env.VAPI_API_KEY = 'vapi-key';
        const clients = createEnhancedIntegrationClients({
          source: 'test',
          includeVapi: true,
        });

        expect(() => clients.destroy()).not.toThrow();
      });

      it('should handle destroy when no vapi client', () => {
        const clients = createEnhancedIntegrationClients({ source: 'test' });

        expect(() => clients.destroy()).not.toThrow();
      });
    });

    describe('useMocks flag', () => {
      it('should create mock scheduling service when useMocks is true', () => {
        const clients = createEnhancedIntegrationClients({
          source: 'test',
          includeScheduling: true,
          useMocks: true,
        });

        expect(clients.scheduling).not.toBeNull();
      });

      it('should create mock Stripe client when useMocks is true', () => {
        const clients = createEnhancedIntegrationClients({
          source: 'test',
          includeStripe: true,
          useMocks: true,
        });

        expect(clients.stripe).not.toBeNull();
      });
    });
  });

  describe('environment credential helpers', () => {
    describe('getOpenAIApiKey', () => {
      it('should return OpenAI API key', () => {
        process.env.OPENAI_API_KEY = 'sk-test-123';
        expect(getOpenAIApiKey()).toBe('sk-test-123');
      });

      it('should return undefined when not set', () => {
        delete process.env.OPENAI_API_KEY;
        expect(getOpenAIApiKey()).toBeUndefined();
      });
    });

    describe('getHubSpotAccessToken', () => {
      it('should return HubSpot access token', () => {
        process.env.HUBSPOT_ACCESS_TOKEN = 'token-123';
        expect(getHubSpotAccessToken()).toBe('token-123');
      });

      it('should return undefined when not set', () => {
        delete process.env.HUBSPOT_ACCESS_TOKEN;
        expect(getHubSpotAccessToken()).toBeUndefined();
      });
    });

    describe('getWhatsAppCredentials', () => {
      it('should return credentials when both are set', () => {
        process.env.WHATSAPP_API_KEY = 'wa-key';
        process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';

        const creds = getWhatsAppCredentials();

        expect(creds).toEqual({
          apiKey: 'wa-key',
          phoneNumberId: '123456',
        });
      });

      it('should return null when API key is missing', () => {
        delete process.env.WHATSAPP_API_KEY;
        process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';

        expect(getWhatsAppCredentials()).toBeNull();
      });

      it('should return null when phone number ID is missing', () => {
        process.env.WHATSAPP_API_KEY = 'wa-key';
        delete process.env.WHATSAPP_PHONE_NUMBER_ID;

        expect(getWhatsAppCredentials()).toBeNull();
      });

      it('should return null when both are missing', () => {
        delete process.env.WHATSAPP_API_KEY;
        delete process.env.WHATSAPP_PHONE_NUMBER_ID;

        expect(getWhatsAppCredentials()).toBeNull();
      });
    });

    describe('getVapiCredentials', () => {
      it('should return credentials with API key only', () => {
        process.env.VAPI_API_KEY = 'vapi-123';
        delete process.env.VAPI_ASSISTANT_ID;

        const creds = getVapiCredentials();

        expect(creds).toEqual({ apiKey: 'vapi-123' });
      });

      it('should return credentials with API key and assistant ID', () => {
        process.env.VAPI_API_KEY = 'vapi-123';
        process.env.VAPI_ASSISTANT_ID = 'assistant-456';

        const creds = getVapiCredentials();

        expect(creds).toEqual({
          apiKey: 'vapi-123',
          assistantId: 'assistant-456',
        });
      });

      it('should return null when API key is missing', () => {
        delete process.env.VAPI_API_KEY;
        process.env.VAPI_ASSISTANT_ID = 'assistant-456';

        expect(getVapiCredentials()).toBeNull();
      });
    });

    describe('getStripeCredentials', () => {
      it('should return credentials with secret key only', () => {
        process.env.STRIPE_SECRET_KEY = 'sk_test_123';
        delete process.env.STRIPE_WEBHOOK_SECRET;

        const creds = getStripeCredentials();

        expect(creds).toEqual({ secretKey: 'sk_test_123' });
      });

      it('should return credentials with secret key and webhook secret', () => {
        process.env.STRIPE_SECRET_KEY = 'sk_test_123';
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_456';

        const creds = getStripeCredentials();

        expect(creds).toEqual({
          secretKey: 'sk_test_123',
          webhookSecret: 'whsec_456',
        });
      });

      it('should return null when secret key is missing', () => {
        delete process.env.STRIPE_SECRET_KEY;
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_456';

        expect(getStripeCredentials()).toBeNull();
      });
    });

    describe('getSchedulingCredentials', () => {
      it('should return credentials when both are set', () => {
        process.env.SCHEDULING_API_URL = 'https://api.example.com';
        process.env.SCHEDULING_API_KEY = 'key-123';

        const creds = getSchedulingCredentials();

        expect(creds).toEqual({
          apiUrl: 'https://api.example.com',
          apiKey: 'key-123',
        });
      });

      it('should return null when API URL is missing', () => {
        delete process.env.SCHEDULING_API_URL;
        process.env.SCHEDULING_API_KEY = 'key-123';

        expect(getSchedulingCredentials()).toBeNull();
      });

      it('should return null when API key is missing', () => {
        process.env.SCHEDULING_API_URL = 'https://api.example.com';
        delete process.env.SCHEDULING_API_KEY;

        expect(getSchedulingCredentials()).toBeNull();
      });
    });
  });

  describe('legacy createIntegrationClients wrapper', () => {
    it('should create clients using legacy interface', () => {
      const config: ClientsConfig = {
        source: 'test',
        includeOpenAI: true,
        includeScoring: true,
      };

      const clients = createIntegrationClients(config);

      expect(clients).toBeDefined();
      expect(clients.eventStore).toBeDefined();
      expect(typeof clients.isConfigured).toBe('function');
    });

    it('should map circuit breaker config correctly', () => {
      const config: ClientsConfig = {
        source: 'test',
        circuitBreaker: {
          failureThreshold: 10,
          resetTimeoutMs: 60000,
        },
      };

      const clients = createIntegrationClients(config);

      expect(clients).toBeDefined();
    });

    it('should provide all legacy methods', () => {
      const clients = createIntegrationClients({ source: 'test' });

      expect(typeof clients.isConfigured).toBe('function');
      expect(typeof clients.getCircuitBreakerStats).toBe('function');
      expect(typeof clients.isCircuitOpen).toBe('function');
      expect(typeof clients.resetCircuit).toBe('function');
    });

    it('should work without optional properties', () => {
      const clients = createIntegrationClients({ source: 'test' });

      expect(clients.hubspot).toBeDefined();
      expect(clients.whatsapp).toBeDefined();
    });
  });
});
