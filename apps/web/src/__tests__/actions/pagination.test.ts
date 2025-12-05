import { describe, it, expect, vi } from 'vitest';

// Mock server-only to allow importing server actions in tests
vi.mock('server-only', () => ({}));

import {
  validatePageSize,
  emptyPaginatedResponse,
  fetchAllContacts,
  type FetchAllOptions,
} from '../../app/actions/shared/pagination';

describe('Pagination Utilities', () => {
  describe('validatePageSize', () => {
    it('should return value within min-max range', () => {
      expect(validatePageSize(50)).toBe(50);
      expect(validatePageSize(25)).toBe(25);
    });

    it('should clamp to maximum when value exceeds max', () => {
      expect(validatePageSize(150, 1, 100)).toBe(100);
      expect(validatePageSize(200, 1, 100)).toBe(100);
    });

    it('should clamp to minimum when value is below min', () => {
      expect(validatePageSize(0, 1, 100)).toBe(1);
      expect(validatePageSize(-10, 1, 100)).toBe(1);
    });

    it('should handle edge cases', () => {
      expect(validatePageSize(1, 1, 100)).toBe(1);
      expect(validatePageSize(100, 1, 100)).toBe(100);
    });

    it('should use default min and max when not provided', () => {
      expect(validatePageSize(0)).toBe(1); // min defaults to 1
      expect(validatePageSize(150)).toBe(100); // max defaults to 100 (HUBSPOT_PAGE_SIZE)
    });

    it('should accept custom min and max', () => {
      expect(validatePageSize(5, 10, 50 as 100)).toBe(10);
      expect(validatePageSize(60, 10, 50 as 100)).toBe(50);
      expect(validatePageSize(30, 10, 50 as 100)).toBe(30);
    });
  });

  describe('emptyPaginatedResponse', () => {
    it('should return empty response structure', () => {
      const result = emptyPaginatedResponse();

      expect(result).toEqual({
        items: [],
        nextCursor: null,
        hasMore: false,
        total: 0,
      });
    });

    it('should have correct types', () => {
      const result = emptyPaginatedResponse<{ id: string; name: string }>();

      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBe(0);
      expect(result.nextCursor).toBeNull();
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should return independent instances', () => {
      const result1 = emptyPaginatedResponse();
      const result2 = emptyPaginatedResponse();

      expect(result1).not.toBe(result2);
      expect(result1.items).not.toBe(result2.items);
    });
  });

  describe('fetchAllContacts', () => {
    it('should fetch all pages of results', async () => {
      const mockContacts = [
        { id: '1', properties: { firstname: 'John' } },
        { id: '2', properties: { firstname: 'Jane' } },
        { id: '3', properties: { firstname: 'Bob' } },
      ];

      const mockClient = {
        searchContacts: vi
          .fn()
          .mockResolvedValueOnce({
            results: [mockContacts[0], mockContacts[1]],
            paging: { next: { after: 'cursor1' } },
          })
          .mockResolvedValueOnce({
            results: [mockContacts[2]],
            paging: undefined,
          }),
      };

      const result = await fetchAllContacts(
        mockClient as any,
        { filterGroups: [], properties: ['firstname'] },
        { pageSize: 2 }
      );

      expect(result).toEqual(mockContacts);
      expect(mockClient.searchContacts).toHaveBeenCalledTimes(2);
    });

    it('should stop at maxResults limit', async () => {
      const mockContacts = Array.from({ length: 10 }, (_, i) => ({
        id: String(i + 1),
        properties: { firstname: `User${i + 1}` },
      }));

      const mockClient = {
        searchContacts: vi
          .fn()
          .mockResolvedValueOnce({
            results: mockContacts.slice(0, 5),
            paging: { next: { after: 'cursor1' } },
          })
          .mockResolvedValueOnce({
            results: mockContacts.slice(5, 10),
            paging: { next: { after: 'cursor2' } },
          }),
      };

      const result = await fetchAllContacts(
        mockClient as any,
        { filterGroups: [], properties: ['firstname'] },
        { maxResults: 7, pageSize: 5 }
      );

      expect(result.length).toBe(10); // Gets 5 + 5, then stops
      expect(mockClient.searchContacts).toHaveBeenCalledTimes(2);
    });

    it('should handle single page response', async () => {
      const mockContacts = [
        { id: '1', properties: { firstname: 'John' } },
        { id: '2', properties: { firstname: 'Jane' } },
      ];

      const mockClient = {
        searchContacts: vi.fn().mockResolvedValueOnce({
          results: mockContacts,
          paging: undefined,
        }),
      };

      const result = await fetchAllContacts(mockClient as any, {
        filterGroups: [],
        properties: ['firstname'],
      });

      expect(result).toEqual(mockContacts);
      expect(mockClient.searchContacts).toHaveBeenCalledTimes(1);
    });

    it('should pass search parameters correctly', async () => {
      const searchParams = {
        filterGroups: [
          {
            filters: [{ propertyName: 'lifecyclestage', operator: 'EQ' as const, value: 'lead' }],
          },
        ],
        properties: ['firstname', 'lastname', 'email'],
      };

      const mockClient = {
        searchContacts: vi.fn().mockResolvedValueOnce({
          results: [],
          paging: undefined,
        }),
      };

      await fetchAllContacts(mockClient as any, searchParams);

      expect(mockClient.searchContacts).toHaveBeenCalledWith({
        ...searchParams,
        limit: 100, // Default pageSize
        after: undefined,
      });
    });

    it('should pass cursor to subsequent requests', async () => {
      const mockClient = {
        searchContacts: vi
          .fn()
          .mockResolvedValueOnce({
            results: [{ id: '1', properties: {} }],
            paging: { next: { after: 'cursor-abc' } },
          })
          .mockResolvedValueOnce({
            results: [{ id: '2', properties: {} }],
            paging: undefined,
          }),
      };

      await fetchAllContacts(mockClient as any, { filterGroups: [], properties: ['firstname'] });

      expect(mockClient.searchContacts).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          after: undefined,
        })
      );

      expect(mockClient.searchContacts).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          after: 'cursor-abc',
        })
      );
    });

    it('should handle empty results', async () => {
      const mockClient = {
        searchContacts: vi.fn().mockResolvedValueOnce({
          results: [],
          paging: undefined,
        }),
      };

      const result = await fetchAllContacts(mockClient as any, {
        filterGroups: [],
        properties: ['firstname'],
      });

      expect(result).toEqual([]);
      expect(mockClient.searchContacts).toHaveBeenCalledTimes(1);
    });

    it('should use default options when not provided', async () => {
      const mockClient = {
        searchContacts: vi.fn().mockResolvedValueOnce({
          results: [],
          paging: undefined,
        }),
      };

      await fetchAllContacts(mockClient as any, { filterGroups: [], properties: ['firstname'] });

      expect(mockClient.searchContacts).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100, // Default HUBSPOT_PAGE_SIZE
        })
      );
    });

    it('should use custom pageSize option', async () => {
      const mockClient = {
        searchContacts: vi.fn().mockResolvedValueOnce({
          results: [],
          paging: undefined,
        }),
      };

      await fetchAllContacts(
        mockClient as any,
        { filterGroups: [], properties: ['firstname'] },
        { pageSize: 50 }
      );

      expect(mockClient.searchContacts).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
        })
      );
    });

    it('should accumulate results across pages', async () => {
      const page1 = [
        { id: '1', properties: { firstname: 'John' } },
        { id: '2', properties: { firstname: 'Jane' } },
      ];
      const page2 = [
        { id: '3', properties: { firstname: 'Bob' } },
        { id: '4', properties: { firstname: 'Alice' } },
      ];
      const page3 = [{ id: '5', properties: { firstname: 'Charlie' } }];

      const mockClient = {
        searchContacts: vi
          .fn()
          .mockResolvedValueOnce({
            results: page1,
            paging: { next: { after: 'cursor1' } },
          })
          .mockResolvedValueOnce({
            results: page2,
            paging: { next: { after: 'cursor2' } },
          })
          .mockResolvedValueOnce({
            results: page3,
            paging: undefined,
          }),
      };

      const result = await fetchAllContacts(mockClient as any, {
        filterGroups: [],
        properties: ['firstname'],
      });

      expect(result).toEqual([...page1, ...page2, ...page3]);
      expect(result.length).toBe(5);
    });
  });
});
