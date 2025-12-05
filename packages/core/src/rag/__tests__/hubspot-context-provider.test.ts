/**
 * Comprehensive tests for HubSpotContextProvider
 *
 * Tests cover:
 * - Context fetching by contact ID
 * - Context fetching by phone number
 * - Patient context formatting
 * - Lead score classification
 * - Context string building
 * - Configuration management
 * - Error handling and graceful degradation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HubSpotContextProvider,
  createHubSpotContextProvider,
  type IHubSpotClient,
  type HubSpotContactForRAG,
  type HubSpotContextConfig,
  type PatientContext,
} from '../hubspot-context-provider.js';

// ============= Mock Setup =============

class MockHubSpotClient implements IHubSpotClient {
  private contacts: Map<string, HubSpotContactForRAG> = new Map();

  constructor() {
    // Add some test contacts
    this.contacts.set('contact-1', this.createMockContact('contact-1', '+40712345678'));
    this.contacts.set('contact-2', this.createMockContact('contact-2', '+40787654321'));
  }

  async getContact(contactId: string): Promise<HubSpotContactForRAG> {
    const contact = this.contacts.get(contactId);
    if (!contact) {
      throw new Error('Contact not found');
    }
    return contact;
  }

  async searchContactsByPhone(phone: string): Promise<HubSpotContactForRAG[]> {
    return Array.from(this.contacts.values()).filter((c) => c.properties.phone === phone);
  }

  private createMockContact(id: string, phone: string): HubSpotContactForRAG {
    return {
      id,
      properties: {
        firstname: 'John',
        lastname: 'Doe',
        email: 'john.doe@example.com',
        phone,
        lifecyclestage: 'lead',
        lead_status: 'new',
        lead_score: '4',
        lead_source: 'website',
        hs_language: 'ro',
        procedure_interest: 'Implant dentar',
        budget_range: '5000-10000 RON',
        urgency_level: 'medium',
        consent_marketing: 'true',
        consent_medical_data: 'true',
        retention_score: '75',
        churn_risk: 'SCAZUT',
        nps_score: '9',
        nps_category: 'PROMOTOR',
        loyalty_segment: 'Gold',
        lifetime_value: '15000',
        days_inactive: '5',
        canceled_appointments: '0',
        total_treatments: '3',
        last_appointment_date: '2024-11-15',
        last_treatment_date: '2024-11-15',
        active_discounts: '10% off next visit;Free consultation',
      },
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-12-01T00:00:00Z',
    };
  }

  // Helper to set custom contact
  setContact(id: string, contact: HubSpotContactForRAG): void {
    this.contacts.set(id, contact);
  }
}

// ============= Test Suite =============

describe('HubSpotContextProvider', () => {
  let client: MockHubSpotClient;
  let provider: HubSpotContextProvider;

  beforeEach(() => {
    client = new MockHubSpotClient();
    provider = new HubSpotContextProvider(client);
  });

  describe('Constructor and Configuration', () => {
    it('should create provider with default config', () => {
      expect(provider).toBeInstanceOf(HubSpotContextProvider);
    });

    it('should create provider with custom config', () => {
      const customConfig: Partial<HubSpotContextConfig> = {
        enabled: false,
        cacheTTLSeconds: 600,
        includeRetentionMetrics: false,
      };

      provider = new HubSpotContextProvider(client, customConfig);
      const config = provider.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.cacheTTLSeconds).toBe(600);
      expect(config.includeRetentionMetrics).toBe(false);
    });

    it('should apply default values for missing config', () => {
      const config = provider.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.cacheTTLSeconds).toBe(300);
      expect(config.includeRetentionMetrics).toBe(true);
      expect(config.includeNPSData).toBe(true);
      expect(config.includeLoyaltySegment).toBe(true);
      expect(config.maxContextLength).toBe(2000);
    });

    it('should validate config with zod schema', () => {
      const invalidConfig = {
        cacheTTLSeconds: -1, // Invalid
      };

      expect(() => new HubSpotContextProvider(client, invalidConfig)).toThrow();
    });
  });

  describe('getContextByContactId()', () => {
    it('should fetch and format context by contact ID', async () => {
      const context = await provider.getContextByContactId('contact-1');

      expect(context).toBeDefined();
      expect(context?.patient).toBeDefined();
      expect(context?.contextString).toBeDefined();
      expect(context?.source).toBe('hubspot');
      expect(context?.fetchedAt).toBeInstanceOf(Date);
    });

    it('should return null when service is disabled', async () => {
      provider = new HubSpotContextProvider(client, { enabled: false });

      const context = await provider.getContextByContactId('contact-1');

      expect(context).toBeNull();
    });

    it('should return null on error (graceful degradation)', async () => {
      const context = await provider.getContextByContactId('non-existent-id');

      expect(context).toBeNull();
    });

    it('should include all patient fields', async () => {
      const context = await provider.getContextByContactId('contact-1');

      expect(context?.patient.patientId).toBe('contact-1');
      expect(context?.patient.name).toBe('John Doe');
      expect(context?.patient.phone).toBe('+40712345678');
      expect(context?.patient.email).toBe('john.doe@example.com');
      expect(context?.patient.leadStatus).toBe('new');
      expect(context?.patient.leadScore).toBe(4);
      expect(context?.patient.classification).toBe('HOT');
    });

    it('should include retention metrics when enabled', async () => {
      const context = await provider.getContextByContactId('contact-1');

      expect(context?.patient.retentionScore).toBe(75);
      expect(context?.patient.churnRisk).toBe('SCAZUT');
      expect(context?.patient.daysInactive).toBe(5);
    });

    it('should exclude retention metrics when disabled', async () => {
      provider = new HubSpotContextProvider(client, { includeRetentionMetrics: false });

      const context = await provider.getContextByContactId('contact-1');

      expect(context?.patient.retentionScore).toBeUndefined();
      expect(context?.patient.churnRisk).toBeUndefined();
    });

    it('should include NPS data when enabled', async () => {
      const context = await provider.getContextByContactId('contact-1');

      expect(context?.patient.npsScore).toBe(9);
      expect(context?.patient.npsCategory).toBe('PROMOTOR');
    });

    it('should exclude NPS data when disabled', async () => {
      provider = new HubSpotContextProvider(client, { includeNPSData: false });

      const context = await provider.getContextByContactId('contact-1');

      expect(context?.patient.npsScore).toBeUndefined();
      expect(context?.patient.npsCategory).toBeUndefined();
    });

    it('should include loyalty segment when enabled', async () => {
      const context = await provider.getContextByContactId('contact-1');

      expect(context?.patient.loyaltySegment).toBe('Gold');
      expect(context?.patient.lifetimeValue).toBe(15000);
    });

    it('should exclude loyalty segment when disabled', async () => {
      provider = new HubSpotContextProvider(client, { includeLoyaltySegment: false });

      const context = await provider.getContextByContactId('contact-1');

      expect(context?.patient.loyaltySegment).toBeUndefined();
      expect(context?.patient.lifetimeValue).toBeUndefined();
    });

    it('should parse active discounts correctly', async () => {
      const context = await provider.getContextByContactId('contact-1');

      expect(context?.patient.activeDiscounts).toEqual(['10% off next visit', 'Free consultation']);
    });

    it('should exclude active discounts when disabled', async () => {
      provider = new HubSpotContextProvider(client, { includeActiveDiscounts: false });

      const context = await provider.getContextByContactId('contact-1');

      expect(context?.patient.activeDiscounts).toBeUndefined();
    });

    it('should set cache TTL from config', async () => {
      provider = new HubSpotContextProvider(client, { cacheTTLSeconds: 600 });

      const context = await provider.getContextByContactId('contact-1');

      expect(context?.cacheTTL).toBe(600);
    });
  });

  describe('getContextByPhone()', () => {
    it('should fetch context by phone number', async () => {
      const context = await provider.getContextByPhone('+40712345678');

      expect(context).toBeDefined();
      expect(context?.patient.phone).toBe('+40712345678');
    });

    it('should return null when service is disabled', async () => {
      provider = new HubSpotContextProvider(client, { enabled: false });

      const context = await provider.getContextByPhone('+40712345678');

      expect(context).toBeNull();
    });

    it('should return null when no contacts found', async () => {
      const context = await provider.getContextByPhone('+40799999999');

      expect(context).toBeNull();
    });

    it('should return null on error (graceful degradation)', async () => {
      const failingClient = {
        getContact: vi.fn(),
        searchContactsByPhone: vi.fn().mockRejectedValue(new Error('API Error')),
      };

      provider = new HubSpotContextProvider(failingClient);

      const context = await provider.getContextByPhone('+40712345678');

      expect(context).toBeNull();
    });

    it('should use oldest contact when multiple found', async () => {
      const contact1: HubSpotContactForRAG = {
        id: 'contact-old',
        properties: { phone: '+40712345678', firstname: 'Old' },
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
      };

      const contact2: HubSpotContactForRAG = {
        id: 'contact-new',
        properties: { phone: '+40712345678', firstname: 'New' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      client.setContact('contact-old', contact1);
      client.setContact('contact-new', contact2);

      const context = await provider.getContextByPhone('+40712345678');

      expect(context?.patient.patientId).toBe('contact-old');
    });
  });

  describe('Lead Score Classification', () => {
    it('should classify score 5 as HOT', async () => {
      const contact: HubSpotContactForRAG = {
        id: 'test',
        properties: { lead_score: '5', phone: '+40712345678' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      client.setContact('test', contact);
      const context = await provider.getContextByContactId('test');

      expect(context?.patient.classification).toBe('HOT');
    });

    it('should classify score 4 as HOT', async () => {
      const contact: HubSpotContactForRAG = {
        id: 'test',
        properties: { lead_score: '4', phone: '+40712345678' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      client.setContact('test', contact);
      const context = await provider.getContextByContactId('test');

      expect(context?.patient.classification).toBe('HOT');
    });

    it('should classify score 3 as WARM', async () => {
      const contact: HubSpotContactForRAG = {
        id: 'test',
        properties: { lead_score: '3', phone: '+40712345678' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      client.setContact('test', contact);
      const context = await provider.getContextByContactId('test');

      expect(context?.patient.classification).toBe('WARM');
    });

    it('should classify score 2 as COLD', async () => {
      const contact: HubSpotContactForRAG = {
        id: 'test',
        properties: { lead_score: '2', phone: '+40712345678' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      client.setContact('test', contact);
      const context = await provider.getContextByContactId('test');

      expect(context?.patient.classification).toBe('COLD');
    });

    it('should classify score 1 as UNQUALIFIED', async () => {
      const contact: HubSpotContactForRAG = {
        id: 'test',
        properties: { lead_score: '1', phone: '+40712345678' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      client.setContact('test', contact);
      const context = await provider.getContextByContactId('test');

      expect(context?.patient.classification).toBe('UNQUALIFIED');
    });

    it('should classify score 0 as UNKNOWN', async () => {
      const contact: HubSpotContactForRAG = {
        id: 'test',
        properties: { lead_score: '0', phone: '+40712345678' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      client.setContact('test', contact);
      const context = await provider.getContextByContactId('test');

      expect(context?.patient.classification).toBe('UNKNOWN');
    });
  });

  describe('Context String Building', () => {
    it('should build complete context string', async () => {
      const context = await provider.getContextByContactId('contact-1');

      expect(context?.contextString).toContain('Patient Profile');
      expect(context?.contextString).toContain('John Doe');
      expect(context?.contextString).toContain('Lead Status');
      expect(context?.contextString).toContain('HOT');
    });

    it('should include medical interest section', async () => {
      const context = await provider.getContextByContactId('contact-1');

      expect(context?.contextString).toContain('Medical Interest');
      expect(context?.contextString).toContain('Implant dentar');
      expect(context?.contextString).toContain('5000-10000 RON');
    });

    it('should include retention metrics section when enabled', async () => {
      const context = await provider.getContextByContactId('contact-1');

      expect(context?.contextString).toContain('Retention Metrics');
      expect(context?.contextString).toContain('75/100');
      expect(context?.contextString).toContain('SCAZUT');
    });

    it('should include NPS section when enabled', async () => {
      const context = await provider.getContextByContactId('contact-1');

      expect(context?.contextString).toContain('NPS Score');
      expect(context?.contextString).toContain('9/10');
      expect(context?.contextString).toContain('PROMOTOR');
    });

    it('should include loyalty section when enabled', async () => {
      const context = await provider.getContextByContactId('contact-1');

      expect(context?.contextString).toContain('Loyalty');
      expect(context?.contextString).toContain('Gold');
      expect(context?.contextString).toContain('15000 RON');
    });

    it('should include active offers section', async () => {
      const context = await provider.getContextByContactId('contact-1');

      expect(context?.contextString).toContain('Active Offers');
      expect(context?.contextString).toContain('10% off next visit');
      expect(context?.contextString).toContain('Free consultation');
    });

    it('should include consent section', async () => {
      const context = await provider.getContextByContactId('contact-1');

      expect(context?.contextString).toContain('Consent');
      expect(context?.contextString).toContain('Marketing: Yes');
      expect(context?.contextString).toContain('Medical Data: Yes');
    });

    it('should include recent activity when available', async () => {
      const context = await provider.getContextByContactId('contact-1');

      expect(context?.contextString).toContain('Recent Activity');
      expect(context?.contextString).toContain('2024-11-15');
    });

    it('should truncate long context strings', async () => {
      provider = new HubSpotContextProvider(client, { maxContextLength: 200 });

      const context = await provider.getContextByContactId('contact-1');

      expect(context?.contextString.length).toBeLessThanOrEqual(200);
      if (context && context.contextString.length === 200) {
        expect(context.contextString).toMatch(/\.\.\.$/);
      }
    });

    it('should handle missing optional fields gracefully', async () => {
      const minimalContact: HubSpotContactForRAG = {
        id: 'minimal',
        properties: {
          phone: '+40712345678',
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      client.setContact('minimal', minimalContact);
      const context = await provider.getContextByContactId('minimal');

      expect(context?.contextString).toContain('Patient Profile');
      expect(context?.contextString).toContain('Unknown'); // Default name
    });
  });

  describe('Configuration Management', () => {
    it('should get current configuration', () => {
      const config = provider.getConfig();

      expect(config).toBeDefined();
      expect(config.enabled).toBe(true);
      expect(config.cacheTTLSeconds).toBe(300);
    });

    it('should update configuration', () => {
      provider.updateConfig({ cacheTTLSeconds: 600, includeRetentionMetrics: false });

      const config = provider.getConfig();

      expect(config.cacheTTLSeconds).toBe(600);
      expect(config.includeRetentionMetrics).toBe(false);
    });

    it('should validate updated configuration', () => {
      expect(() => {
        provider.updateConfig({ cacheTTLSeconds: -1 });
      }).toThrow();
    });

    it('should merge partial updates', () => {
      const originalTTL = provider.getConfig().cacheTTLSeconds;

      provider.updateConfig({ includeNPSData: false });

      const config = provider.getConfig();
      expect(config.includeNPSData).toBe(false);
      expect(config.cacheTTLSeconds).toBe(originalTTL);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle consent values correctly', async () => {
      const contact: HubSpotContactForRAG = {
        id: 'test',
        properties: {
          phone: '+40712345678',
          consent_marketing: 'false',
          consent_medical_data: 'true',
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      client.setContact('test', contact);
      const context = await provider.getContextByContactId('test');

      expect(context?.patient.hasMarketingConsent).toBe(false);
      expect(context?.patient.hasMedicalDataConsent).toBe(true);
    });

    it('should default to Romanian language', async () => {
      const contact: HubSpotContactForRAG = {
        id: 'test',
        properties: { phone: '+40712345678' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      client.setContact('test', contact);
      const context = await provider.getContextByContactId('test');

      expect(context?.patient.language).toBe('ro');
    });

    it('should handle missing name gracefully', async () => {
      const contact: HubSpotContactForRAG = {
        id: 'test',
        properties: { phone: '+40712345678' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      client.setContact('test', contact);
      const context = await provider.getContextByContactId('test');

      expect(context?.patient.name).toBe('Unknown');
    });

    it('should handle partial names', async () => {
      const contact: HubSpotContactForRAG = {
        id: 'test',
        properties: { firstname: 'John', phone: '+40712345678' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      client.setContact('test', contact);
      const context = await provider.getContextByContactId('test');

      expect(context?.patient.name).toBe('John');
    });

    it('should parse numeric strings correctly', async () => {
      const context = await provider.getContextByContactId('contact-1');

      expect(typeof context?.patient.leadScore).toBe('number');
      expect(typeof context?.patient.retentionScore).toBe('number');
      expect(typeof context?.patient.npsScore).toBe('number');
    });

    it('should handle empty active discounts', async () => {
      const contact: HubSpotContactForRAG = {
        id: 'test',
        properties: { phone: '+40712345678', active_discounts: '' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      client.setContact('test', contact);

      provider = new HubSpotContextProvider(client, { includeActiveDiscounts: true });
      const context = await provider.getContextByContactId('test');

      // activeDiscounts may be undefined or empty array depending on implementation
      expect(context?.patient.activeDiscounts ?? []).toEqual([]);
    });
  });
});

describe('Factory Function', () => {
  it('should create provider with factory function', () => {
    const client = new MockHubSpotClient();
    const provider = createHubSpotContextProvider(client);

    expect(provider).toBeInstanceOf(HubSpotContextProvider);
  });

  it('should create provider with custom config', () => {
    const client = new MockHubSpotClient();
    const config = { cacheTTLSeconds: 600 };

    const provider = createHubSpotContextProvider(client, config);

    expect(provider.getConfig().cacheTTLSeconds).toBe(600);
  });
});
