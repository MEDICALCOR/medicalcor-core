/**
 * Comprehensive tests for CRM factory and mock adapter
 * Tests crm/factory.ts and crm/mock.adapter.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCRMProvider,
  getMockCRMProvider,
  isMockCRMProvider,
  resetCRMProvider,
  CRMFactory,
} from '../crm/factory.js';
import {
  MockCrmAdapter,
  MockCrmError,
  createMockCrmAdapter,
  createSuccessMockCrm,
  createErrorMockCrm,
  createFlakyMockCrm,
  createSlowMockCrm,
  type MockCrmScenario,
  type MockCrmConfig,
} from '../crm/mock.adapter.js';
import type { LeadDTO, TreatmentPlanDTO } from '@medicalcor/types';

describe('crm/factory', () => {
  beforeEach(() => {
    resetCRMProvider();
    delete process.env.CRM_PROVIDER;
    delete process.env.CRM_MOCK_SCENARIO;
    delete process.env.CRM_MOCK_LATENCY_MS;
    delete process.env.CRM_MOCK_ERROR_RATE;
    delete process.env.CRM_MOCK_VERBOSE;
  });

  afterEach(() => {
    resetCRMProvider();
  });

  describe('getCRMProvider', () => {
    it('should return Pipedrive adapter by default', () => {
      const provider = getCRMProvider();
      expect(provider).toBeDefined();
      expect(provider.sourceName).toBe('pipedrive');
    });

    it('should return mock adapter when CRM_PROVIDER=mock', () => {
      process.env.CRM_PROVIDER = 'mock';
      const provider = getCRMProvider();

      expect(provider).toBeInstanceOf(MockCrmAdapter);
    });

    it('should return same instance on subsequent calls', () => {
      const provider1 = getCRMProvider();
      const provider2 = getCRMProvider();

      expect(provider1).toBe(provider2);
    });

    it('should throw on unknown provider', () => {
      process.env.CRM_PROVIDER = 'unknown-provider';

      expect(() => getCRMProvider()).toThrow('Unknown CRM Provider: unknown-provider');
    });

    it('should be case insensitive', () => {
      process.env.CRM_PROVIDER = 'MOCK';
      const provider = getCRMProvider();

      expect(provider).toBeInstanceOf(MockCrmAdapter);
    });
  });

  describe('getMockCRMProvider', () => {
    it('should return mock adapter when configured', () => {
      process.env.CRM_PROVIDER = 'mock';
      const provider = getMockCRMProvider();

      expect(provider).toBeInstanceOf(MockCrmAdapter);
    });

    it('should return null when not using mock', () => {
      const provider = getMockCRMProvider();
      expect(provider).toBeNull();
    });
  });

  describe('isMockCRMProvider', () => {
    it('should return true for mock provider', () => {
      process.env.CRM_PROVIDER = 'mock';
      getCRMProvider(); // Initialize

      expect(isMockCRMProvider()).toBe(true);
    });

    it('should return false for real provider', () => {
      process.env.CRM_PROVIDER = 'pipedrive';
      getCRMProvider(); // Initialize

      expect(isMockCRMProvider()).toBe(false);
    });
  });

  describe('resetCRMProvider', () => {
    it('should reset singleton instance', () => {
      const provider1 = getCRMProvider();
      resetCRMProvider();
      const provider2 = getCRMProvider();

      expect(provider2).not.toBe(provider1);
    });
  });

  describe('CRMFactory (deprecated)', () => {
    it('should provide getProvider method', () => {
      const provider = CRMFactory.getProvider();
      expect(provider).toBeDefined();
    });

    it('should provide reset method', () => {
      CRMFactory.reset();
      // Should not throw
    });
  });

  describe('environment configuration', () => {
    it('should parse mock scenario from env', () => {
      process.env.CRM_PROVIDER = 'mock';
      process.env.CRM_MOCK_SCENARIO = 'error';

      const provider = getMockCRMProvider();
      // Scenario is internal, but we can test error behavior
      expect(provider).toBeDefined();
    });

    it('should parse latency from env', () => {
      process.env.CRM_PROVIDER = 'mock';
      process.env.CRM_MOCK_LATENCY_MS = '100';

      const provider = getMockCRMProvider();
      expect(provider).toBeDefined();
    });

    it('should parse error rate from env', () => {
      process.env.CRM_PROVIDER = 'mock';
      process.env.CRM_MOCK_ERROR_RATE = '0.5';

      const provider = getMockCRMProvider();
      expect(provider).toBeDefined();
    });

    it('should parse verbose flag from env', () => {
      process.env.CRM_PROVIDER = 'mock';
      process.env.CRM_MOCK_VERBOSE = 'true';

      const provider = getMockCRMProvider();
      expect(provider).toBeDefined();
    });

    it('should handle invalid scenario gracefully', () => {
      process.env.CRM_PROVIDER = 'mock';
      process.env.CRM_MOCK_SCENARIO = 'invalid-scenario';

      const provider = getMockCRMProvider();
      expect(provider).toBeDefined(); // Falls back to default
    });
  });
});

describe('crm/mock-adapter - MockCrmAdapter', () => {
  let adapter: MockCrmAdapter;

  beforeEach(() => {
    adapter = new MockCrmAdapter({ scenario: 'success' });
  });

  describe('constructor', () => {
    it('should create adapter with defaults', () => {
      expect(adapter).toBeInstanceOf(MockCrmAdapter);
      expect(adapter.sourceName).toBe('mock');
    });

    it('should accept custom config', () => {
      const custom = new MockCrmAdapter({
        scenario: 'error',
        baseLatencyMs: 100,
        errorRate: 0.5,
        verbose: true,
        sourceName: 'custom-mock',
      });

      expect(custom.sourceName).toBe('custom-mock');
    });

    it('should validate config with Zod', () => {
      expect(() => new MockCrmAdapter({ errorRate: 1.5 })).toThrow();
    });
  });

  describe('parseContactWebhook', () => {
    it('should parse valid contact payload', () => {
      const payload = MockCrmAdapter.createSampleContactPayload();
      const lead = adapter.parseContactWebhook(payload);

      expect(lead).toBeDefined();
      expect(lead?.phone).toBe('+40712345678');
      expect(lead?.fullName).toBe('Test Contact');
      expect(lead?.externalSource).toBe('mock');
    });

    it('should return null for invalid payload', () => {
      const lead = adapter.parseContactWebhook(null);
      expect(lead).toBeNull();
    });

    it('should return null for non-object payload', () => {
      const lead = adapter.parseContactWebhook('string payload');
      expect(lead).toBeNull();
    });

    it('should return null when missing phone', () => {
      const payload = { id: '123', name: 'Test' };
      const lead = adapter.parseContactWebhook(payload);
      expect(lead).toBeNull();
    });

    it('should return null when missing ID', () => {
      const payload = { phone: '+40712345678', name: 'Test' };
      const lead = adapter.parseContactWebhook(payload);
      expect(lead).toBeNull();
    });

    it('should extract phone from array format', () => {
      const payload = {
        id: '123',
        name: 'Test',
        phone: [{ value: '+40712345678', primary: true }],
      };
      const lead = adapter.parseContactWebhook(payload);

      expect(lead?.phone).toBe('+40712345678');
    });

    it('should extract phone from string format', () => {
      const payload = {
        id: '123',
        name: 'Test',
        phone: '+40712345678',
      };
      const lead = adapter.parseContactWebhook(payload);

      expect(lead?.phone).toBe('+40712345678');
    });

    it('should handle current wrapper', () => {
      const payload = {
        current: {
          id: '123',
          name: 'Test',
          phone: '+40712345678',
        },
      };
      const lead = adapter.parseContactWebhook(payload);

      expect(lead).toBeDefined();
      expect(lead?.phone).toBe('+40712345678');
    });

    it('should handle data wrapper', () => {
      const payload = {
        data: {
          id: '123',
          name: 'Test',
          phone: '+40712345678',
        },
      };
      const lead = adapter.parseContactWebhook(payload);

      expect(lead).toBeDefined();
    });

    it('should extract email', () => {
      const payload = {
        id: '123',
        name: 'Test',
        phone: '+40712345678',
        email: 'test@example.com',
      };
      const lead = adapter.parseContactWebhook(payload);

      expect(lead?.email).toBe('test@example.com');
    });

    it('should extract language', () => {
      const payload = {
        id: '123',
        name: 'Test',
        phone: '+40712345678',
        language: 'en',
      };
      const lead = adapter.parseContactWebhook(payload);

      expect(lead?.language).toBe('en');
    });

    it('should default language to "ro"', () => {
      const payload = {
        id: '123',
        name: 'Test',
        phone: '+40712345678',
      };
      const lead = adapter.parseContactWebhook(payload);

      expect(lead?.language).toBe('ro');
    });

    it('should extract GDPR consent', () => {
      const payload = {
        id: '123',
        name: 'Test',
        phone: '+40712345678',
        gdpr_consent: true,
      };
      const lead = adapter.parseContactWebhook(payload);

      expect(lead?.gdprConsent).toBe(true);
      expect(lead?.gdprConsentAt).toBeInstanceOf(Date);
      expect(lead?.gdprConsentSource).toBe('mock_crm_sync');
    });

    it('should store lead in internal store', () => {
      const payload = MockCrmAdapter.createSampleContactPayload({ id: 'stored-123' });
      adapter.parseContactWebhook(payload);

      const stored = adapter.getStoredLeads();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.externalContactId).toBe('stored-123');
    });
  });

  describe('parseDealWebhook', () => {
    it('should parse valid deal payload', () => {
      const payload = MockCrmAdapter.createSampleDealPayload();
      const plan = adapter.parseDealWebhook(payload);

      expect(plan).toBeDefined();
      expect(plan?.externalSource).toBe('mock');
      expect(plan?.totalValue).toBe(1500);
      expect(plan?.currency).toBe('EUR');
    });

    it('should return null for invalid payload', () => {
      const plan = adapter.parseDealWebhook(null);
      expect(plan).toBeNull();
    });

    it('should return null when missing person_id', () => {
      const payload = {
        id: 'deal123',
        title: 'Test Deal',
        value: 1000,
      };
      const plan = adapter.parseDealWebhook(payload);
      expect(plan).toBeNull();
    });

    it('should set isAccepted for won deals', () => {
      const payload = MockCrmAdapter.createSampleDealPayload({ status: 'won' });
      const plan = adapter.parseDealWebhook(payload);

      expect(plan?.isAccepted).toBe(true);
      expect(plan?.acceptedAt).toBeInstanceOf(Date);
    });

    it('should set rejectedReason for lost deals', () => {
      const payload = MockCrmAdapter.createSampleDealPayload({
        status: 'lost',
        lost_reason: 'Too expensive',
      });
      const plan = adapter.parseDealWebhook(payload);

      expect(plan?.isAccepted).toBe(false);
      expect(plan?.rejectedReason).toBe('Too expensive');
    });

    it('should store treatment plan in internal store', () => {
      const payload = MockCrmAdapter.createSampleDealPayload({ id: 'deal-123' });
      adapter.parseDealWebhook(payload);

      const stored = adapter.getStoredTreatmentPlans();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.externalDealId).toBe('deal-123');
    });
  });

  describe('checkHealth', () => {
    it('should return healthy status for success scenario', async () => {
      const health = await adapter.checkHealth();

      expect(health.status).toBe('healthy');
      expect(health.details.scenario).toBe('success');
      expect(health.details.connectionStatus).toBe('connected');
    });

    it('should return unhealthy for error scenario', async () => {
      const errorAdapter = new MockCrmAdapter({ scenario: 'error' });
      const health = await errorAdapter.checkHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.details.connectionStatus).toBe('disconnected');
    });

    it('should return degraded for partial scenario', async () => {
      const partialAdapter = new MockCrmAdapter({ scenario: 'partial' });
      const health = await partialAdapter.checkHealth();

      expect(health.status).toBe('degraded');
    });

    it('should include latency', async () => {
      const health = await adapter.checkHealth();

      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should include API version', async () => {
      const health = await adapter.checkHealth();

      expect(health.details.apiVersion).toBe('1.0.0-mock');
    });
  });

  describe('scenarios', () => {
    it('should throw error in error scenario', () => {
      const errorAdapter = new MockCrmAdapter({ scenario: 'error' });
      const payload = MockCrmAdapter.createSampleContactPayload();

      expect(() => errorAdapter.parseContactWebhook(payload)).toThrow(MockCrmError);
    });

    it('should throw specific error types', () => {
      const authAdapter = new MockCrmAdapter({ scenario: 'error', errorType: 'auth' });
      const payload = MockCrmAdapter.createSampleContactPayload();

      expect(() => authAdapter.parseContactWebhook(payload)).toThrow('Invalid API credentials');
    });

    it('should throw network error', () => {
      const networkAdapter = new MockCrmAdapter({ scenario: 'error', errorType: 'network' });
      const payload = MockCrmAdapter.createSampleContactPayload();

      expect(() => networkAdapter.parseContactWebhook(payload)).toThrow('Network timeout');
    });

    it('should throw rate limit error', () => {
      const rateLimitAdapter = new MockCrmAdapter({
        scenario: 'error',
        errorType: 'rate_limit',
      });
      const payload = MockCrmAdapter.createSampleContactPayload();

      expect(() => rateLimitAdapter.parseContactWebhook(payload)).toThrow('Rate limit exceeded');
    });
  });

  describe('statistics', () => {
    it('should track call count', () => {
      const payload = MockCrmAdapter.createSampleContactPayload();
      adapter.parseContactWebhook(payload);
      adapter.parseContactWebhook(payload);

      const stats = adapter.getStats();
      expect(stats.callCount).toBe(2);
    });

    it('should track last call time', () => {
      const payload = MockCrmAdapter.createSampleContactPayload();
      adapter.parseContactWebhook(payload);

      const stats = adapter.getStats();
      expect(stats.lastCallTime).toBeInstanceOf(Date);
    });

    it('should track stored leads and plans', () => {
      adapter.parseContactWebhook(MockCrmAdapter.createSampleContactPayload({ id: '1' }));
      adapter.parseDealWebhook(MockCrmAdapter.createSampleDealPayload({ id: '1' }));

      const stats = adapter.getStats();
      expect(stats.storedLeads).toBe(1);
      expect(stats.storedPlans).toBe(1);
    });
  });

  describe('reset', () => {
    it('should clear all stored data', () => {
      adapter.parseContactWebhook(MockCrmAdapter.createSampleContactPayload());
      adapter.parseDealWebhook(MockCrmAdapter.createSampleDealPayload());

      adapter.reset();

      const stats = adapter.getStats();
      expect(stats.storedLeads).toBe(0);
      expect(stats.storedPlans).toBe(0);
      expect(stats.callCount).toBe(0);
    });
  });

  describe('webhook history', () => {
    it('should track webhook history', () => {
      adapter.parseContactWebhook(MockCrmAdapter.createSampleContactPayload());
      adapter.parseDealWebhook(MockCrmAdapter.createSampleDealPayload());

      const history = adapter.getWebhookHistory();
      expect(history).toHaveLength(2);
      expect(history[0]?.type).toBe('contact');
      expect(history[1]?.type).toBe('deal');
    });
  });

  describe('sample payload generators', () => {
    it('should create sample contact payload', () => {
      const payload = MockCrmAdapter.createSampleContactPayload();

      expect(payload).toHaveProperty('id');
      expect(payload).toHaveProperty('name');
      expect(payload).toHaveProperty('phone');
      expect(payload).toHaveProperty('email');
    });

    it('should apply overrides to contact payload', () => {
      const payload = MockCrmAdapter.createSampleContactPayload({
        name: 'Custom Name',
      });

      expect(payload.name).toBe('Custom Name');
    });

    it('should create sample deal payload', () => {
      const payload = MockCrmAdapter.createSampleDealPayload();

      expect(payload).toHaveProperty('id');
      expect(payload).toHaveProperty('title');
      expect(payload).toHaveProperty('person_id');
      expect(payload).toHaveProperty('value');
    });

    it('should apply overrides to deal payload', () => {
      const payload = MockCrmAdapter.createSampleDealPayload({
        value: 5000,
      });

      expect(payload.value).toBe(5000);
    });
  });

  describe('data extraction', () => {
    it('should handle numeric ID', () => {
      const payload = {
        id: 12345,
        name: 'Test',
        phone: '+40712345678',
      };
      const lead = adapter.parseContactWebhook(payload);

      expect(lead?.externalContactId).toBe('12345');
    });

    it('should extract boolean from string', () => {
      const payload = {
        id: '123',
        name: 'Test',
        phone: '+40712345678',
        gdpr_consent: 'true',
      };
      const lead = adapter.parseContactWebhook(payload);

      expect(lead?.gdprConsent).toBe(true);
    });

    it('should extract number from string', () => {
      const payload = {
        id: 'deal123',
        person_id: 'person123',
        value: '1500.50',
        title: 'Test',
      };
      const plan = adapter.parseDealWebhook(payload);

      expect(plan?.totalValue).toBe(1500.5);
    });
  });

  describe('MockCrmError', () => {
    it('should create error with all properties', () => {
      const error = new MockCrmError('Test error', 'TEST_ERROR', 500, true);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.isRetryable).toBe(true);
      expect(error.name).toBe('MockCrmError');
    });

    it('should capture stack trace', () => {
      const error = new MockCrmError('Test', 'TEST', 500, false);
      expect(error.stack).toBeDefined();
    });
  });
});

describe('crm/mock-adapter - Factory Functions', () => {
  describe('createMockCrmAdapter', () => {
    it('should create adapter with config', () => {
      const adapter = createMockCrmAdapter({ scenario: 'success' });
      expect(adapter).toBeInstanceOf(MockCrmAdapter);
    });
  });

  describe('createSuccessMockCrm', () => {
    it('should create success scenario adapter', () => {
      const adapter = createSuccessMockCrm();
      expect(adapter).toBeInstanceOf(MockCrmAdapter);

      const payload = MockCrmAdapter.createSampleContactPayload();
      const lead = adapter.parseContactWebhook(payload);
      expect(lead).toBeDefined();
    });
  });

  describe('createErrorMockCrm', () => {
    it('should create error scenario adapter', () => {
      const adapter = createErrorMockCrm();
      const payload = MockCrmAdapter.createSampleContactPayload();

      expect(() => adapter.parseContactWebhook(payload)).toThrow();
    });

    it('should accept custom error type', () => {
      const adapter = createErrorMockCrm('auth');
      const payload = MockCrmAdapter.createSampleContactPayload();

      expect(() => adapter.parseContactWebhook(payload)).toThrow('Invalid API credentials');
    });
  });

  describe('createFlakyMockCrm', () => {
    it('should create flaky adapter', () => {
      const adapter = createFlakyMockCrm(0.3);
      expect(adapter).toBeInstanceOf(MockCrmAdapter);
    });
  });

  describe('createSlowMockCrm', () => {
    it('should create slow adapter', () => {
      const adapter = createSlowMockCrm(2000);
      expect(adapter).toBeInstanceOf(MockCrmAdapter);
    });
  });
});
