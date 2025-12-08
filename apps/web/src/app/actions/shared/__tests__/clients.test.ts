// @ts-nocheck
/**
 * Clients Utility Tests
 *
 * Tests for singleton client factory functions
 * Note: Due to 'server-only' import, we mock the entire module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock server-only to avoid errors
vi.mock('server-only', () => ({}));

// Create proper class mocks
class MockHubSpotClient {
  accessToken: string;
  searchContacts = vi.fn();
  constructor({ accessToken }: { accessToken: string }) {
    this.accessToken = accessToken;
  }
}

class MockStripeClient {
  secretKey: string;
  getDailyRevenue = vi.fn();
  constructor({ secretKey }: { secretKey: string }) {
    this.secretKey = secretKey;
  }
}

// Mock the integrations module
vi.mock('@medicalcor/integrations', () => ({
  HubSpotClient: MockHubSpotClient,
  StripeClient: MockStripeClient,
  createMockStripeClient: vi.fn().mockReturnValue({
    isMock: true,
    getDailyRevenue: vi.fn(),
  }),
}));

// Save original env
const originalEnv = { ...process.env };

describe('Client Factory Functions', () => {
  beforeEach(() => {
    // Reset process.env
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getHubSpotClient', () => {
    it('should create HubSpotClient when token is set', async () => {
      process.env.HUBSPOT_ACCESS_TOKEN = 'test-token';

      // Import fresh module
      const { getHubSpotClient, resetClients } = await import('../clients.js');
      resetClients();

      const client = getHubSpotClient();
      expect(client).toBeDefined();
    });

    it('should throw when HUBSPOT_ACCESS_TOKEN is not set', async () => {
      delete process.env.HUBSPOT_ACCESS_TOKEN;

      const { getHubSpotClient, resetClients } = await import('../clients.js');
      resetClients();

      expect(() => getHubSpotClient()).toThrow(
        'HUBSPOT_ACCESS_TOKEN environment variable is not set'
      );
    });

    it('should return singleton instance', async () => {
      process.env.HUBSPOT_ACCESS_TOKEN = 'test-token';

      const { getHubSpotClient, resetClients } = await import('../clients.js');
      resetClients();

      const client1 = getHubSpotClient();
      const client2 = getHubSpotClient();

      expect(client1).toBe(client2);
    });
  });

  describe('getStripeClient', () => {
    it('should create StripeClient when secret key is set', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';

      const { getStripeClient, resetClients } = await import('../clients.js');
      resetClients();

      const client = getStripeClient();
      expect(client).toBeDefined();
    });

    it('should create mock client when secret key is not set', async () => {
      delete process.env.STRIPE_SECRET_KEY;

      const { getStripeClient, resetClients } = await import('../clients.js');
      resetClients();

      const client = getStripeClient();
      expect(client).toBeDefined();
    });

    it('should return singleton instance', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';

      const { getStripeClient, resetClients } = await import('../clients.js');
      resetClients();

      const client1 = getStripeClient();
      const client2 = getStripeClient();

      expect(client1).toBe(client2);
    });
  });

  describe('getSchedulingService', () => {
    it('should return scheduling service', async () => {
      const { getSchedulingService, resetClients } = await import('../clients.js');
      resetClients();

      const service = getSchedulingService();
      expect(service).toBeDefined();
      expect(service.getAvailableSlots).toBeDefined();
      expect(service.bookAppointment).toBeDefined();
      expect(service.getUpcomingAppointments).toBeDefined();
    });

    it('should return singleton instance', async () => {
      const { getSchedulingService, resetClients } = await import('../clients.js');
      resetClients();

      const service1 = getSchedulingService();
      const service2 = getSchedulingService();

      expect(service1).toBe(service2);
    });
  });

  describe('MockSchedulingRepository', () => {
    it('should return empty slots', async () => {
      const { getSchedulingService, resetClients } = await import('../clients.js');
      resetClients();

      const service = getSchedulingService();
      const slots = await service.getAvailableSlots('test-clinic');

      expect(slots).toEqual([]);
    });

    it('should return error for booking requests when service unavailable', async () => {
      const { getSchedulingService, resetClients } = await import('../clients.js');
      resetClients();

      const service = getSchedulingService();

      const result = await service.bookAppointment({
        patientId: 'p1',
        slotId: 's1',
        procedureType: 'checkup',
        notes: '',
      });

      expect(result.success).toBe(false);
      expect('error' in result).toBe(true);
    });

    it('should return empty upcoming appointments', async () => {
      const { getSchedulingService, resetClients } = await import('../clients.js');
      resetClients();

      const service = getSchedulingService();
      const appointments = await service.getUpcomingAppointments(
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(appointments).toEqual([]);
    });
  });

  describe('resetClients', () => {
    it('should reset all clients', async () => {
      process.env.HUBSPOT_ACCESS_TOKEN = 'test-token';
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';

      const { getHubSpotClient, getStripeClient, getSchedulingService, resetClients } =
        await import('../clients.js');

      // Get initial instances
      const hubspot1 = getHubSpotClient();
      const stripe1 = getStripeClient();
      const scheduling1 = getSchedulingService();

      // Reset
      resetClients();

      // Get new instances
      const hubspot2 = getHubSpotClient();
      const stripe2 = getStripeClient();
      const scheduling2 = getSchedulingService();

      // Should be different instances after reset
      expect(hubspot1).not.toBe(hubspot2);
      expect(stripe1).not.toBe(stripe2);
      expect(scheduling1).not.toBe(scheduling2);
    });
  });

  describe('Constants', () => {
    it('should export DEFAULT_TIMEZONE', async () => {
      const { DEFAULT_TIMEZONE } = await import('../clients.js');
      expect(DEFAULT_TIMEZONE).toBe('Europe/Bucharest');
    });

    it('should export HUBSPOT_PAGE_SIZE', async () => {
      const { HUBSPOT_PAGE_SIZE } = await import('../clients.js');
      expect(HUBSPOT_PAGE_SIZE).toBe(100);
    });

    it('should export MAX_FETCH_RESULTS', async () => {
      const { MAX_FETCH_RESULTS } = await import('../clients.js');
      expect(MAX_FETCH_RESULTS).toBe(5000);
    });
  });
});
