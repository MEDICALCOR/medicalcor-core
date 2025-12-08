// @ts-nocheck
/**
 * Pagination Utility Tests
 *
 * Comprehensive tests for pagination utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAllContacts, validatePageSize, emptyPaginatedResponse } from '../pagination.js';
import type { HubSpotClient, HubSpotContact } from '@medicalcor/integrations';

// Mock the clients module
vi.mock('../clients.js', () => ({
  HUBSPOT_PAGE_SIZE: 100,
  MAX_FETCH_RESULTS: 5000,
}));

describe('Pagination Utilities', () => {
  describe('fetchAllContacts', () => {
    let mockHubspot: { searchContacts: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockHubspot = {
        searchContacts: vi.fn(),
      };
    });

    it('should fetch all contacts in single page', async () => {
      const contacts: HubSpotContact[] = [
        {
          id: '1',
          properties: { email: 'test1@example.com' },
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          archived: false,
        },
        {
          id: '2',
          properties: { email: 'test2@example.com' },
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          archived: false,
        },
      ];

      mockHubspot.searchContacts.mockResolvedValue({
        results: contacts,
        paging: undefined,
      });

      const result = await fetchAllContacts(mockHubspot as unknown as HubSpotClient, {
        filterGroups: [],
        properties: ['email'],
      });

      expect(result).toEqual(contacts);
      expect(mockHubspot.searchContacts).toHaveBeenCalledTimes(1);
    });

    it('should paginate through multiple pages', async () => {
      const page1Contacts: HubSpotContact[] = [
        { id: '1', properties: {}, createdAt: '', updatedAt: '', archived: false },
      ];
      const page2Contacts: HubSpotContact[] = [
        { id: '2', properties: {}, createdAt: '', updatedAt: '', archived: false },
      ];

      mockHubspot.searchContacts
        .mockResolvedValueOnce({
          results: page1Contacts,
          paging: { next: { after: 'cursor1' } },
        })
        .mockResolvedValueOnce({
          results: page2Contacts,
          paging: undefined,
        });

      const result = await fetchAllContacts(mockHubspot as unknown as HubSpotClient, {
        filterGroups: [],
        properties: ['email'],
      });

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('1');
      expect(result[1]?.id).toBe('2');
      expect(mockHubspot.searchContacts).toHaveBeenCalledTimes(2);
    });

    it('should respect maxResults limit', async () => {
      const contacts: HubSpotContact[] = Array.from({ length: 50 }, (_, i) => ({
        id: String(i),
        properties: {},
        createdAt: '',
        updatedAt: '',
        archived: false,
      }));

      mockHubspot.searchContacts.mockResolvedValue({
        results: contacts,
        paging: { next: { after: 'cursor1' } },
      });

      const result = await fetchAllContacts(
        mockHubspot as unknown as HubSpotClient,
        { filterGroups: [], properties: [] },
        { maxResults: 50 }
      );

      expect(result.length).toBeLessThanOrEqual(50);
      expect(mockHubspot.searchContacts).toHaveBeenCalledTimes(1);
    });

    it('should use custom pageSize', async () => {
      mockHubspot.searchContacts.mockResolvedValue({
        results: [],
        paging: undefined,
      });

      await fetchAllContacts(
        mockHubspot as unknown as HubSpotClient,
        { filterGroups: [], properties: [] },
        { pageSize: 25 }
      );

      expect(mockHubspot.searchContacts).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25 })
      );
    });

    it('should pass search params correctly', async () => {
      mockHubspot.searchContacts.mockResolvedValue({
        results: [],
        paging: undefined,
      });

      await fetchAllContacts(mockHubspot as unknown as HubSpotClient, {
        filterGroups: [
          {
            filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' }],
          },
        ],
        properties: ['firstname', 'lastname', 'email'],
        sorts: ['createdate'],
      });

      expect(mockHubspot.searchContacts).toHaveBeenCalledWith(
        expect.objectContaining({
          filterGroups: [
            {
              filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' }],
            },
          ],
          properties: ['firstname', 'lastname', 'email'],
          sorts: ['createdate'],
        })
      );
    });

    it('should handle empty results', async () => {
      mockHubspot.searchContacts.mockResolvedValue({
        results: [],
        paging: undefined,
      });

      const result = await fetchAllContacts(mockHubspot as unknown as HubSpotClient, {
        filterGroups: [],
        properties: [],
      });

      expect(result).toEqual([]);
    });

    it('should pass cursor in subsequent requests', async () => {
      mockHubspot.searchContacts
        .mockResolvedValueOnce({
          results: [{ id: '1', properties: {}, createdAt: '', updatedAt: '', archived: false }],
          paging: { next: { after: 'next_cursor_123' } },
        })
        .mockResolvedValueOnce({
          results: [],
          paging: undefined,
        });

      await fetchAllContacts(mockHubspot as unknown as HubSpotClient, {
        filterGroups: [],
        properties: [],
      });

      // Second call should have the cursor
      expect(mockHubspot.searchContacts).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ after: 'next_cursor_123' })
      );
    });

    it('should stop when maxResults is reached mid-page', async () => {
      const contacts: HubSpotContact[] = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        properties: {},
        createdAt: '',
        updatedAt: '',
        archived: false,
      }));

      mockHubspot.searchContacts.mockResolvedValue({
        results: contacts,
        paging: { next: { after: 'cursor' } },
      });

      const result = await fetchAllContacts(
        mockHubspot as unknown as HubSpotClient,
        { filterGroups: [], properties: [] },
        { maxResults: 100 }
      );

      expect(result).toHaveLength(100);
      expect(mockHubspot.searchContacts).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple pages until cursor is empty', async () => {
      mockHubspot.searchContacts
        .mockResolvedValueOnce({
          results: [{ id: '1', properties: {}, createdAt: '', updatedAt: '', archived: false }],
          paging: { next: { after: 'cursor1' } },
        })
        .mockResolvedValueOnce({
          results: [{ id: '2', properties: {}, createdAt: '', updatedAt: '', archived: false }],
          paging: { next: { after: 'cursor2' } },
        })
        .mockResolvedValueOnce({
          results: [{ id: '3', properties: {}, createdAt: '', updatedAt: '', archived: false }],
          paging: undefined,
        });

      const result = await fetchAllContacts(mockHubspot as unknown as HubSpotClient, {
        filterGroups: [],
        properties: [],
      });

      expect(result).toHaveLength(3);
      expect(mockHubspot.searchContacts).toHaveBeenCalledTimes(3);
    });
  });

  describe('validatePageSize', () => {
    it('should return pageSize when within range', () => {
      expect(validatePageSize(50)).toBe(50);
      expect(validatePageSize(1)).toBe(1);
      expect(validatePageSize(100)).toBe(100);
    });

    it('should clamp to minimum', () => {
      expect(validatePageSize(0)).toBe(1);
      expect(validatePageSize(-10)).toBe(1);
    });

    it('should clamp to maximum', () => {
      expect(validatePageSize(150)).toBe(100);
      expect(validatePageSize(1000)).toBe(100);
    });

    it('should use custom min value', () => {
      expect(validatePageSize(5, 10)).toBe(10);
      expect(validatePageSize(15, 10)).toBe(15);
    });

    it('should use custom max value', () => {
      expect(validatePageSize(50, 1, 25)).toBe(25);
      expect(validatePageSize(20, 1, 25)).toBe(20);
    });

    it('should handle custom min and max together', () => {
      expect(validatePageSize(5, 10, 50)).toBe(10);
      expect(validatePageSize(60, 10, 50)).toBe(50);
      expect(validatePageSize(25, 10, 50)).toBe(25);
    });

    it('should handle edge case where min equals max', () => {
      expect(validatePageSize(50, 25, 25)).toBe(25);
      expect(validatePageSize(10, 25, 25)).toBe(25);
      expect(validatePageSize(100, 25, 25)).toBe(25);
    });
  });

  describe('emptyPaginatedResponse', () => {
    it('should return correct structure', () => {
      const response = emptyPaginatedResponse<{ id: string }>();

      expect(response).toEqual({
        items: [],
        nextCursor: null,
        hasMore: false,
        total: 0,
      });
    });

    it('should return empty items array', () => {
      const response = emptyPaginatedResponse<number>();
      expect(response.items).toEqual([]);
      expect(response.items.length).toBe(0);
    });

    it('should have null nextCursor', () => {
      const response = emptyPaginatedResponse<string>();
      expect(response.nextCursor).toBeNull();
    });

    it('should have hasMore as false', () => {
      const response = emptyPaginatedResponse<boolean>();
      expect(response.hasMore).toBe(false);
    });

    it('should have total as 0', () => {
      const response = emptyPaginatedResponse<unknown>();
      expect(response.total).toBe(0);
    });

    it('should be typed correctly', () => {
      interface TestType {
        id: string;
        name: string;
      }

      const response = emptyPaginatedResponse<TestType>();

      // TypeScript should recognize items as TestType[]
      const _items: TestType[] = response.items;
      expect(_items).toEqual([]);
    });
  });
});
