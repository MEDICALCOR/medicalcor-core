/**
 * HubSpot Context Provider Tests
 *
 * Comprehensive tests for HubSpot CRM data fetching for RAG
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HubSpotContextProvider,
  HubSpotContextConfigSchema,
  type IHubSpotClient,
  type HubSpotContactForRAG,
} from '../hubspot-context-provider.js';

describe('HubSpotContextProvider', () => {
  let mockClient: IHubSpotClient;
  let provider: HubSpotContextProvider;

  function createMockContact(
    overrides: Partial<HubSpotContactForRAG['properties']> = {}
  ): HubSpotContactForRAG {
    return {
      id: 'contact-123',
      properties: {
        firstname: 'Ion',
        lastname: 'Popescu',
        email: 'ion@example.com',
        phone: '+40721234567',
        lifecyclestage: 'lead',
        lead_status: 'new',
        lead_score: '4',
        lead_source: 'website',
        hs_language: 'ro',
        procedure_interest: 'All-on-4',
        budget_range: '15000-20000',
        urgency_level: 'high',
        consent_marketing: 'true',
        consent_medical_data: 'true',
        retention_score: '85',
        churn_risk: 'SCAZUT',
        nps_score: '9',
        nps_category: 'PROMOTOR',
        loyalty_segment: 'Gold',
        lifetime_value: '25000',
        days_inactive: '5',
        canceled_appointments: '0',
        total_treatments: '3',
        last_appointment_date: '2025-05-15',
        last_treatment_date: '2025-04-20',
        active_discounts: '10% loyalty;Free consultation',
        ...overrides,
      },
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-06-01T15:30:00Z',
    };
  }

  function createMockClient(): IHubSpotClient {
    return {
      getContact: vi.fn().mockResolvedValue(createMockContact()),
      searchContactsByPhone: vi.fn().mockResolvedValue([createMockContact()]),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    provider = new HubSpotContextProvider(mockClient);
  });

  describe('Constructor', () => {
    it('should create provider with default configuration', () => {
      expect(provider).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const customProvider = new HubSpotContextProvider(mockClient, {
        cacheTTLSeconds: 600,
        includeRetentionMetrics: false,
      });

      expect(customProvider).toBeDefined();
    });
  });

  describe('getContextByContactId', () => {
    it('should fetch and format contact context', async () => {
      const result = await provider.getContextByContactId('contact-123');

      expect(result).not.toBeNull();
      expect(result?.patient.patientId).toBe('contact-123');
      expect(result?.patient.name).toBe('Ion Popescu');
      expect(result?.source).toBe('hubspot');
      expect(mockClient.getContact).toHaveBeenCalledWith('contact-123');
    });

    it('should return null when disabled', async () => {
      const disabledProvider = new HubSpotContextProvider(mockClient, {
        enabled: false,
      });

      const result = await disabledProvider.getContextByContactId('contact-123');

      expect(result).toBeNull();
      expect(mockClient.getContact).not.toHaveBeenCalled();
    });

    it('should return null on API error', async () => {
      (mockClient.getContact as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('API Error')
      );

      const result = await provider.getContextByContactId('contact-123');

      expect(result).toBeNull();
    });

    it('should include retention metrics when enabled', async () => {
      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.retentionScore).toBe(85);
      expect(result?.patient.churnRisk).toBe('SCAZUT');
      expect(result?.patient.daysInactive).toBe(5);
    });

    it('should exclude retention metrics when disabled', async () => {
      const noRetentionProvider = new HubSpotContextProvider(mockClient, {
        includeRetentionMetrics: false,
      });

      const result = await noRetentionProvider.getContextByContactId('contact-123');

      expect(result?.patient.retentionScore).toBeUndefined();
    });

    it('should include NPS data when enabled', async () => {
      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.npsScore).toBe(9);
      expect(result?.patient.npsCategory).toBe('PROMOTOR');
    });

    it('should exclude NPS data when disabled', async () => {
      const noNpsProvider = new HubSpotContextProvider(mockClient, {
        includeNPSData: false,
      });

      const result = await noNpsProvider.getContextByContactId('contact-123');

      expect(result?.patient.npsScore).toBeUndefined();
    });

    it('should include loyalty segment when enabled', async () => {
      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.loyaltySegment).toBe('Gold');
      expect(result?.patient.lifetimeValue).toBe(25000);
    });

    it('should include active discounts when enabled', async () => {
      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.activeDiscounts).toContain('10% loyalty');
      expect(result?.patient.activeDiscounts).toContain('Free consultation');
    });
  });

  describe('getContextByPhone', () => {
    it('should search and format contact by phone', async () => {
      const result = await provider.getContextByPhone('+40721234567');

      expect(result).not.toBeNull();
      expect(result?.patient.phone).toBe('+40721234567');
      expect(mockClient.searchContactsByPhone).toHaveBeenCalledWith('+40721234567');
    });

    it('should return null when no contacts found', async () => {
      (mockClient.searchContactsByPhone as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const result = await provider.getContextByPhone('+40721234567');

      expect(result).toBeNull();
    });

    it('should return null when disabled', async () => {
      const disabledProvider = new HubSpotContextProvider(mockClient, {
        enabled: false,
      });

      const result = await disabledProvider.getContextByPhone('+40721234567');

      expect(result).toBeNull();
    });

    it('should return null on API error', async () => {
      (mockClient.searchContactsByPhone as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Search failed')
      );

      const result = await provider.getContextByPhone('+40721234567');

      expect(result).toBeNull();
    });

    it('should use oldest contact when multiple found', async () => {
      const olderContact = createMockContact();
      olderContact.id = 'older-contact';
      olderContact.createdAt = '2024-01-01T10:00:00Z';

      const newerContact = createMockContact();
      newerContact.id = 'newer-contact';
      newerContact.createdAt = '2025-01-01T10:00:00Z';

      (mockClient.searchContactsByPhone as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        newerContact,
        olderContact,
      ]);

      const result = await provider.getContextByPhone('+40721234567');

      expect(result?.patient.patientId).toBe('older-contact');
    });
  });

  describe('Lead Score Classification', () => {
    it('should classify score 4-5 as HOT', async () => {
      (mockClient.getContact as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockContact({ lead_score: '5' })
      );

      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.classification).toBe('HOT');
    });

    it('should classify score 3 as WARM', async () => {
      (mockClient.getContact as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockContact({ lead_score: '3' })
      );

      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.classification).toBe('WARM');
    });

    it('should classify score 2 as COLD', async () => {
      (mockClient.getContact as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockContact({ lead_score: '2' })
      );

      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.classification).toBe('COLD');
    });

    it('should classify score 1 as UNQUALIFIED', async () => {
      (mockClient.getContact as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockContact({ lead_score: '1' })
      );

      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.classification).toBe('UNQUALIFIED');
    });

    it('should classify missing score as UNKNOWN', async () => {
      (mockClient.getContact as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockContact({ lead_score: undefined })
      );

      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.classification).toBe('UNKNOWN');
    });
  });

  describe('Context String Building', () => {
    it('should build formatted context string', async () => {
      const result = await provider.getContextByContactId('contact-123');

      expect(result?.contextString).toContain('## Patient Profile');
      expect(result?.contextString).toContain('Ion Popescu');
      expect(result?.contextString).toContain('## Lead Status');
      expect(result?.contextString).toContain('## Consent');
    });

    it('should include medical interest when present', async () => {
      const result = await provider.getContextByContactId('contact-123');

      expect(result?.contextString).toContain('## Medical Interest');
      expect(result?.contextString).toContain('All-on-4');
    });

    it('should include retention metrics in context', async () => {
      const result = await provider.getContextByContactId('contact-123');

      expect(result?.contextString).toContain('## Retention Metrics');
      expect(result?.contextString).toContain('Retention Score');
    });

    it('should include NPS in context', async () => {
      const result = await provider.getContextByContactId('contact-123');

      expect(result?.contextString).toContain('## NPS Score');
      expect(result?.contextString).toContain('9/10');
    });

    it('should include loyalty in context', async () => {
      const result = await provider.getContextByContactId('contact-123');

      expect(result?.contextString).toContain('## Loyalty');
      expect(result?.contextString).toContain('Gold');
    });

    it('should include active offers in context', async () => {
      const result = await provider.getContextByContactId('contact-123');

      expect(result?.contextString).toContain('## Active Offers');
    });

    it('should include consent status', async () => {
      const result = await provider.getContextByContactId('contact-123');

      expect(result?.contextString).toContain('Marketing: Yes');
      expect(result?.contextString).toContain('Medical Data: Yes');
    });

    it('should handle missing consent as No', async () => {
      (mockClient.getContact as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockContact({
          consent_marketing: 'false',
          consent_medical_data: 'false',
        })
      );

      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.hasMarketingConsent).toBe(false);
      expect(result?.patient.hasMedicalDataConsent).toBe(false);
    });
  });

  describe('Language Handling', () => {
    it('should use Romanian as default language', async () => {
      (mockClient.getContact as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockContact({ hs_language: undefined })
      );

      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.language).toBe('ro');
    });

    it('should use contact language when available', async () => {
      (mockClient.getContact as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockContact({ hs_language: 'en' })
      );

      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.language).toBe('en');
    });
  });

  describe('Cache TTL', () => {
    it('should include cache TTL in response', async () => {
      const result = await provider.getContextByContactId('contact-123');

      expect(result?.cacheTTL).toBe(300); // Default
    });

    it('should use custom cache TTL', async () => {
      const customProvider = new HubSpotContextProvider(mockClient, {
        cacheTTLSeconds: 600,
      });

      const result = await customProvider.getContextByContactId('contact-123');

      expect(result?.cacheTTL).toBe(600);
    });
  });

  describe('Missing Data Handling', () => {
    it('should handle contact with minimal data', async () => {
      (mockClient.getContact as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'minimal-contact',
        properties: {},
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      });

      const result = await provider.getContextByContactId('minimal-contact');

      expect(result).not.toBeNull();
      expect(result?.patient.name).toBe('Unknown');
      expect(result?.patient.leadScore).toBe(0);
      expect(result?.patient.leadStatus).toBe('new');
    });

    it('should handle missing phone', async () => {
      (mockClient.getContact as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockContact({ phone: undefined })
      );

      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.phone).toBe('');
    });

    it('should handle missing email', async () => {
      (mockClient.getContact as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockContact({ email: undefined })
      );

      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.email).toBeUndefined();
    });
  });

  describe('Schema Validation', () => {
    it('should validate config with defaults', () => {
      const parsed = HubSpotContextConfigSchema.parse({});

      expect(parsed.enabled).toBe(true);
      expect(parsed.cacheTTLSeconds).toBe(300);
      expect(parsed.includeRetentionMetrics).toBe(true);
      expect(parsed.includeNPSData).toBe(true);
    });

    it('should accept custom values', () => {
      const parsed = HubSpotContextConfigSchema.parse({
        enabled: false,
        cacheTTLSeconds: 600,
        includeRetentionMetrics: false,
      });

      expect(parsed.enabled).toBe(false);
      expect(parsed.cacheTTLSeconds).toBe(600);
      expect(parsed.includeRetentionMetrics).toBe(false);
    });

    it('should reject negative cache TTL', () => {
      expect(() => HubSpotContextConfigSchema.parse({ cacheTTLSeconds: -1 })).toThrow();
    });

    it('should reject invalid maxContextLength', () => {
      expect(() => HubSpotContextConfigSchema.parse({ maxContextLength: 50 })).toThrow();
    });
  });

  describe('Fetch Metadata', () => {
    it('should include fetch timestamp', async () => {
      const before = new Date();
      const result = await provider.getContextByContactId('contact-123');
      const after = new Date();

      expect(result?.fetchedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result?.fetchedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should include source as hubspot', async () => {
      const result = await provider.getContextByContactId('contact-123');

      expect(result?.source).toBe('hubspot');
    });
  });

  describe('Active Discounts Parsing', () => {
    it('should parse semicolon-separated discounts', async () => {
      (mockClient.getContact as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockContact({
          active_discounts: 'Discount A;Discount B;Discount C',
        })
      );

      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.activeDiscounts).toHaveLength(3);
    });

    it('should filter empty discount entries', async () => {
      (mockClient.getContact as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockContact({
          active_discounts: 'Discount A;;Discount B;',
        })
      );

      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.activeDiscounts).toHaveLength(2);
    });

    it('should handle missing discounts', async () => {
      (mockClient.getContact as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockContact({ active_discounts: undefined })
      );

      const result = await provider.getContextByContactId('contact-123');

      expect(result?.patient.activeDiscounts).toBeUndefined();
    });
  });
});
