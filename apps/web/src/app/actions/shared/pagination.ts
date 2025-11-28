'use server';

/**
 * @fileoverview Pagination Utilities for Server Actions
 *
 * Provides cursor-based pagination helpers for HubSpot API integration.
 * Handles automatic pagination through large result sets with safety limits.
 *
 * @module actions/shared/pagination
 */

import type { HubSpotClient, HubSpotSearchRequest, HubSpotContact } from '@medicalcor/integrations';
import { HUBSPOT_PAGE_SIZE, MAX_FETCH_RESULTS } from './clients.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for paginated fetch operations
 */
export interface FetchAllOptions {
  /** Maximum results to fetch (prevents runaway queries) */
  maxResults?: number;
  /** Page size for each request */
  pageSize?: number;
}

/**
 * Search parameters without pagination fields
 */
export type SearchParamsWithoutPaging = Omit<HubSpotSearchRequest, 'limit' | 'after'>;

// ============================================================================
// PAGINATION HELPERS
// ============================================================================

/**
 * Fetches all contacts matching a search query using cursor-based pagination
 *
 * Automatically handles HubSpot's 100-per-page limit and provides safety
 * limits to prevent excessive API calls.
 *
 * @param hubspot - HubSpot client instance
 * @param searchParams - Search parameters (without limit/after)
 * @param options - Fetch options (maxResults, pageSize)
 * @returns Array of all matching HubSpot contacts
 *
 * @example
 * ```typescript
 * const hubspot = getHubSpotClient();
 * const leads = await fetchAllContacts(hubspot, {
 *   filterGroups: [{
 *     filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' }]
 *   }],
 *   properties: ['firstname', 'lastname', 'email']
 * });
 * ```
 */
export async function fetchAllContacts(
  hubspot: HubSpotClient,
  searchParams: SearchParamsWithoutPaging,
  options: FetchAllOptions = {}
): Promise<HubSpotContact[]> {
  const {
    maxResults = MAX_FETCH_RESULTS,
    pageSize = HUBSPOT_PAGE_SIZE,
  } = options;

  const allResults: HubSpotContact[] = [];
  let cursor: string | undefined;

  do {
    const response = await hubspot.searchContacts({
      ...searchParams,
      limit: pageSize,
      after: cursor,
    });

    allResults.push(...response.results);

    // Get next cursor from HubSpot paging
    cursor = response.paging?.next?.after;

    // Safety check to prevent infinite loops / excessive API calls
    if (allResults.length >= maxResults) {
      break;
    }
  } while (cursor);

  return allResults;
}

/**
 * Validates and normalizes page size to HubSpot's limits
 *
 * @param pageSize - Requested page size
 * @param min - Minimum allowed (default: 1)
 * @param max - Maximum allowed (default: 100)
 * @returns Clamped page size value
 *
 * @example
 * ```typescript
 * validatePageSize(150) // 100
 * validatePageSize(0) // 1
 * validatePageSize(50) // 50
 * ```
 */
export function validatePageSize(
  pageSize: number,
  min = 1,
  max = HUBSPOT_PAGE_SIZE
): number {
  return Math.min(Math.max(pageSize, min), max);
}

/**
 * Creates an empty paginated response
 * Useful for error cases where we want to return a valid structure
 *
 * @returns Empty paginated response with no items
 */
export function emptyPaginatedResponse<T>(): {
  items: T[];
  nextCursor: null;
  hasMore: false;
  total: 0;
} {
  return {
    items: [],
    nextCursor: null,
    hasMore: false,
    total: 0,
  };
}
