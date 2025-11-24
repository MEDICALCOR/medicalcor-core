import { useState, useCallback, useEffect, useRef } from 'react';
import type { PaginatedResponse } from '@medicalcor/types';

interface UseInfiniteScrollOptions<T> {
  /**
   * Async function that fetches a page of data
   * Returns PaginatedResponse with items and pagination info
   */
  fetchPage: (cursor?: string) => Promise<PaginatedResponse<T>>;

  /**
   * Initial page size (default: 20)
   */
  pageSize?: number;

  /**
   * Whether to fetch on mount (default: true)
   */
  fetchOnMount?: boolean;
}

interface UseInfiniteScrollResult<T> {
  /** All items fetched so far */
  items: T[];

  /** Whether currently loading */
  isLoading: boolean;

  /** Whether initial load is in progress */
  isInitialLoading: boolean;

  /** Whether loading more items */
  isLoadingMore: boolean;

  /** Error if fetch failed */
  error: Error | null;

  /** Whether more items can be loaded */
  hasMore: boolean;

  /** Total count if available */
  total?: number;

  /** Load next page */
  loadMore: () => Promise<void>;

  /** Refresh from beginning */
  refresh: () => Promise<void>;

  /** Observer ref to attach to sentinel element */
  observerRef: (node: HTMLElement | null) => void;
}

/**
 * Hook for cursor-based infinite scroll pagination
 *
 * Usage:
 * ```tsx
 * const { items, isLoading, loadMore, observerRef } = useInfiniteScroll({
 *   fetchPage: (cursor) => getItemsActionPaginated({ cursor, pageSize: 20 })
 * });
 *
 * return (
 *   <div>
 *     {items.map(item => <Item key={item.id} {...item} />)}
 *     <div ref={observerRef}>Loading...</div>
 *   </div>
 * );
 * ```
 */
export function useInfiniteScroll<T>({
  fetchPage,
  pageSize = 20,
  fetchOnMount = true,
}: UseInfiniteScrollOptions<T>): UseInfiniteScrollResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(fetchOnMount);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const observerTarget = useRef<HTMLElement | null>(null);
  const isMounted = useRef(true);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    setIsLoadingMore(true);
    setError(null);

    try {
      const response = await fetchPage(nextCursor ?? undefined);

      if (!isMounted.current) return;

      setItems((prev) => [...prev, ...response.items]);
      setNextCursor(response.nextCursor);
      setHasMore(response.hasMore);
      setTotal(response.total);
    } catch (err) {
      if (!isMounted.current) return;

      const error = err instanceof Error ? err : new Error('Failed to load data');
      setError(error);
      console.error('[useInfiniteScroll] Error loading more:', error);
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [fetchPage, nextCursor, hasMore, isLoading]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setIsInitialLoading(true);
    setError(null);
    setItems([]);
    setNextCursor(null);
    setHasMore(true);

    try {
      const response = await fetchPage(undefined);

      if (!isMounted.current) return;

      setItems(response.items);
      setNextCursor(response.nextCursor);
      setHasMore(response.hasMore);
      setTotal(response.total);
    } catch (err) {
      if (!isMounted.current) return;

      const error = err instanceof Error ? err : new Error('Failed to load data');
      setError(error);
      console.error('[useInfiniteScroll] Error refreshing:', error);
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
        setIsInitialLoading(false);
      }
    }
  }, [fetchPage]);

  // Intersection Observer for auto-loading
  const observerRef = useCallback(
    (node: HTMLElement | null) => {
      if (isLoading) return;

      if (observerTarget.current) {
        observerTarget.current = null;
      }

      if (node) {
        observerTarget.current = node;

        const observer = new IntersectionObserver(
          (entries) => {
            if (entries[0]?.isIntersecting && hasMore && !isLoading) {
              void loadMore();
            }
          },
          { threshold: 0.1 }
        );

        observer.observe(node);

        return () => {
          observer.disconnect();
        };
      }
    },
    [hasMore, isLoading, loadMore]
  );

  // Initial load
  useEffect(() => {
    if (fetchOnMount) {
      void refresh();
    }

    return () => {
      isMounted.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    items,
    isLoading,
    isInitialLoading,
    isLoadingMore,
    error,
    hasMore,
    total,
    loadMore,
    refresh,
    observerRef,
  };
}
