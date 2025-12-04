import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the auth module before importing actions
vi.mock('@/lib/auth/server-action-auth', () => ({
  requirePermission: vi.fn(),
  requirePatientAccess: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AuthorizationError';
    }
  },
}));

// Mock the clients module
const mockHubSpotClient = {
  searchContacts: vi.fn(),
  getContact: vi.fn(),
};

const mockSchedulingService = {
  getUpcomingAppointments: vi.fn(),
};

const mockStripeClient = {
  getDailyRevenue: vi.fn(),
  toMajorUnits: vi.fn((amount: number) => amount / 100),
};

vi.mock('@/app/actions/shared/clients', () => ({
  getHubSpotClient: () => mockHubSpotClient,
  getSchedulingService: () => mockSchedulingService,
  getStripeClient: () => mockStripeClient,
  DEFAULT_TIMEZONE: 'Europe/Bucharest',
  HUBSPOT_PAGE_SIZE: 100,
  MAX_FETCH_RESULTS: 5000,
}));

import {
  getPatientsActionPaginated,
  getRecentLeadsAction,
  getDashboardStatsAction,
  getPatientByIdAction,
} from '@/app/actions/patients/index';
import {
  requirePermission,
  requirePatientAccess,
  AuthorizationError,
} from '@/lib/auth/server-action-auth';

const mockSession = {
  user: {
    id: 'user_123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'admin' as const,
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

describe('Patient Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requirePermission).mockResolvedValue(mockSession);
    vi.mocked(requirePatientAccess).mockResolvedValue(undefined);
  });

  describe('getPatientsActionPaginated', () => {
    it('returns paginated patients successfully', async () => {
      mockHubSpotClient.searchContacts.mockResolvedValue({
        results: [
          {
            id: 'contact_1',
            properties: {
              firstname: 'Ion',
              lastname: 'Popescu',
              phone: '+40721234567',
              email: 'ion@example.com',
              lifecyclestage: 'lead',
              lead_score: '4',
              lead_source: 'website',
              procedure_interest: 'implant',
            },
            createdAt: '2024-01-15T10:00:00Z',
            updatedAt: '2024-01-20T14:30:00Z',
          },
        ],
        total: 1,
        paging: {
          next: {
            after: 'cursor_123',
          },
        },
      });

      const result = await getPatientsActionPaginated({ pageSize: 20 });

      expect(requirePermission).toHaveBeenCalledWith('VIEW_PATIENTS');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: 'contact_1',
        firstName: 'Ion',
        lastName: 'Popescu',
        phone: '+40721234567',
        email: 'ion@example.com',
      });
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('cursor_123');
      expect(result.total).toBe(1);
    });

    it('handles pagination cursor', async () => {
      mockHubSpotClient.searchContacts.mockResolvedValue({
        results: [],
        total: 0,
        paging: null,
      });

      await getPatientsActionPaginated({ cursor: 'test_cursor', pageSize: 20 });

      expect(mockHubSpotClient.searchContacts).toHaveBeenCalledWith(
        expect.objectContaining({
          after: 'test_cursor',
          limit: 20,
        })
      );
    });

    it('validates page size limits', async () => {
      mockHubSpotClient.searchContacts.mockResolvedValue({
        results: [],
        total: 0,
        paging: null,
      });

      // Test with oversized page
      await getPatientsActionPaginated({ pageSize: 500 });

      // Should be clamped to 100
      expect(mockHubSpotClient.searchContacts).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100,
        })
      );
    });

    it('returns empty response on error', async () => {
      mockHubSpotClient.searchContacts.mockRejectedValue(new Error('API Error'));

      const result = await getPatientsActionPaginated();

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('throws AuthorizationError when permission denied', async () => {
      vi.mocked(requirePermission).mockRejectedValue(new AuthorizationError('Permission denied'));

      await expect(getPatientsActionPaginated()).rejects.toThrow(AuthorizationError);
    });
  });

  describe('getRecentLeadsAction', () => {
    it('returns recent leads with masked phones', async () => {
      mockHubSpotClient.searchContacts.mockResolvedValue({
        results: [
          {
            id: 'lead_1',
            properties: {
              phone: '+40721234567',
              lead_score: '4',
              lead_source: 'website',
              createdate: '2024-01-20T10:00:00Z',
            },
            createdAt: '2024-01-20T10:00:00Z',
          },
        ],
      });

      const result = await getRecentLeadsAction(5);

      expect(requirePermission).toHaveBeenCalledWith('VIEW_PATIENTS');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('lead_1');
      // Phone should be masked
      expect(result[0].phone).toMatch(/\*+/);
      expect(result[0].score).toBe(4);
    });

    it('clamps score to 1-5 range', async () => {
      mockHubSpotClient.searchContacts.mockResolvedValue({
        results: [
          {
            id: 'lead_1',
            properties: {
              phone: '+40721234567',
              lead_score: '10', // Over max
              lead_source: 'website',
            },
            createdAt: '2024-01-20T10:00:00Z',
          },
        ],
      });

      const result = await getRecentLeadsAction(1);

      expect(result[0].score).toBe(5); // Clamped to max
    });

    it('returns empty array on error', async () => {
      mockHubSpotClient.searchContacts.mockRejectedValue(new Error('API Error'));

      const result = await getRecentLeadsAction();

      expect(result).toEqual([]);
    });
  });

  describe('getDashboardStatsAction', () => {
    it('returns aggregated dashboard stats', async () => {
      // Mock HubSpot responses
      mockHubSpotClient.searchContacts
        .mockResolvedValueOnce({ total: 150 }) // leads
        .mockResolvedValueOnce({ total: 45 }) // patients
        .mockResolvedValueOnce({ total: 12 }); // urgent

      // Mock scheduling service
      mockSchedulingService.getUpcomingAppointments.mockResolvedValue([
        { id: 'apt_1' },
        { id: 'apt_2' },
        { id: 'apt_3' },
      ]);

      // Mock stripe
      mockStripeClient.getDailyRevenue.mockResolvedValue({ amount: 1500000 }); // 15000 RON in cents

      const result = await getDashboardStatsAction();

      expect(result).toEqual({
        totalLeads: 150,
        activePatients: 45,
        urgentTriage: 12,
        appointmentsToday: 3,
        dailyRevenue: 15000,
      });
    });

    it('returns default stats on error', async () => {
      mockHubSpotClient.searchContacts.mockRejectedValue(new Error('API Error'));

      const result = await getDashboardStatsAction();

      expect(result).toEqual({
        totalLeads: 0,
        activePatients: 0,
        urgentTriage: 0,
        appointmentsToday: 0,
      });
    });
  });

  describe('getPatientByIdAction', () => {
    it('returns patient detail data', async () => {
      mockHubSpotClient.getContact.mockResolvedValue({
        id: 'patient_123',
        properties: {
          firstname: 'Maria',
          lastname: 'Ionescu',
          phone: '+40722345678',
          email: 'maria@example.com',
          lifecyclestage: 'customer',
          lead_score: '5',
          lead_source: 'referral',
          procedure_interest: 'implant,whitening',
          hs_language: 'ro',
        },
        createdAt: '2024-01-10T08:00:00Z',
        updatedAt: '2024-01-25T12:00:00Z',
      });

      const result = await getPatientByIdAction('patient_123');

      expect(requirePermission).toHaveBeenCalledWith('VIEW_PATIENTS');
      expect(requirePatientAccess).toHaveBeenCalledWith('patient_123');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('patient_123');
      expect(result?.firstName).toBe('Maria');
      expect(result?.lastName).toBe('Ionescu');
      expect(result?.leadScore).toBe(5);
    });

    it('returns null on HubSpot error', async () => {
      mockHubSpotClient.getContact.mockRejectedValue(new Error('Not found'));

      const result = await getPatientByIdAction('invalid_id');

      expect(result).toBeNull();
    });

    it('throws AuthorizationError on access denied', async () => {
      vi.mocked(requirePatientAccess).mockRejectedValue(
        new AuthorizationError('Access denied to patient')
      );

      await expect(getPatientByIdAction('patient_123')).rejects.toThrow(AuthorizationError);
    });
  });
});

describe('Pagination Utilities', () => {
  describe('validatePageSize', () => {
    it('clamps page size to valid range', async () => {
      const { validatePageSize } = await import('@/app/actions/shared/pagination');

      expect(validatePageSize(150)).toBe(100);
      expect(validatePageSize(0)).toBe(1);
      expect(validatePageSize(50)).toBe(50);
      expect(validatePageSize(-10)).toBe(1);
    });
  });

  describe('emptyPaginatedResponse', () => {
    it('returns empty response structure', async () => {
      const { emptyPaginatedResponse } = await import('@/app/actions/shared/pagination');

      const result = emptyPaginatedResponse<{ id: string }>();

      expect(result).toEqual({
        items: [],
        nextCursor: null,
        hasMore: false,
        total: 0,
      });
    });
  });
});
