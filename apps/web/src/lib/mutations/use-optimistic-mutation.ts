'use client';

import { useState, useCallback, useRef, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Optimistic UI Mutation Hook
 *
 * Provides instant UI updates with automatic rollback on failure.
 * Implements the "perceived speed" pattern used by Linear, Uber, etc.
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useOptimisticMutation({
 *   mutationFn: updatePatientStatus,
 *   optimisticUpdate: (data) => ({
 *     queryKey: ['patients'],
 *     updater: (old) => old.map(p => p.id === data.id ? { ...p, ...data } : p)
 *   }),
 *   onSuccess: () => toast.success('Status actualizat'),
 *   onError: () => toast.error('Eroare - revenire la starea anterioară'),
 * });
 * ```
 */

export interface OptimisticUpdateConfig<TData, TVariables> {
  queryKey: unknown[];
  updater: (oldData: TData | undefined, variables: TVariables) => TData;
}

export interface UseOptimisticMutationOptions<TData, TError, TVariables, TContext> {
  /** The server action or API call to execute */
  mutationFn: (variables: TVariables) => Promise<TData>;

  /** Configure how to optimistically update the cache */
  optimisticUpdate?: (
    variables: TVariables
  ) => OptimisticUpdateConfig<TData, TVariables> | OptimisticUpdateConfig<TData, TVariables>[];

  /** Called when mutation succeeds */
  onSuccess?: (data: TData, variables: TVariables, context: TContext | undefined) => void;

  /** Called when mutation fails - UI will have already rolled back */
  onError?: (error: TError, variables: TVariables, context: TContext | undefined) => void;

  /** Called after mutation settles (success or error) */
  onSettled?: (
    data: TData | undefined,
    error: TError | null,
    variables: TVariables,
    context: TContext | undefined
  ) => void;

  /** Invalidate these query keys after mutation */
  invalidateKeys?: unknown[][];

  /** Delay before showing loading state (prevents flicker for fast operations) */
  loadingDelay?: number;
}

interface MutationState<TData, TError> {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  data: TData | undefined;
  error: TError | null;
}

export function useOptimisticMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(options: UseOptimisticMutationOptions<TData, TError, TVariables, TContext>) {
  const {
    mutationFn,
    optimisticUpdate,
    onSuccess,
    onError,
    onSettled,
    invalidateKeys,
    loadingDelay = 0,
  } = options;

  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<MutationState<TData, TError>>({
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null,
  });

  const rollbackFnsRef = useRef<(() => void)[]>([]);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const mutate = useCallback(
    async (variables: TVariables, context?: TContext) => {
      // Clear any pending loading timeout
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }

      // Reset state
      setState((prev) => ({
        ...prev,
        isSuccess: false,
        isError: false,
        error: null,
      }));

      // Apply optimistic updates immediately
      rollbackFnsRef.current = [];

      if (optimisticUpdate) {
        const updates = optimisticUpdate(variables);
        const updateArray = Array.isArray(updates) ? updates : [updates];

        for (const update of updateArray) {
          // Save previous state for rollback
          const previousData = queryClient.getQueryData(update.queryKey);

          // Apply optimistic update
          queryClient.setQueryData(update.queryKey, (old: TData | undefined) =>
            update.updater(old, variables)
          );

          // Store rollback function
          rollbackFnsRef.current.push(() => {
            queryClient.setQueryData(update.queryKey, previousData);
          });
        }
      }

      // Set loading state with optional delay (prevents flicker)
      if (loadingDelay > 0) {
        loadingTimeoutRef.current = setTimeout(() => {
          setState((prev) => ({ ...prev, isPending: true }));
        }, loadingDelay);
      } else {
        setState((prev) => ({ ...prev, isPending: true }));
      }

      try {
        // Execute mutation using React transition for concurrent features
        let result: TData;

        await new Promise<void>((resolve) => {
          startTransition(async () => {
            try {
              result = await mutationFn(variables);

              // Clear loading timeout
              if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
              }

              // Success - update state
              setState({
                isPending: false,
                isSuccess: true,
                isError: false,
                data: result,
                error: null,
              });

              // Invalidate related queries for fresh data
              if (invalidateKeys) {
                await Promise.all(
                  invalidateKeys.map((key) => queryClient.invalidateQueries({ queryKey: key }))
                );
              }

              // Call success handler
              onSuccess?.(result, variables, context);
              onSettled?.(result, null, variables, context);

              resolve();
            } catch (err) {
              // Rollback optimistic updates
              for (const rollback of rollbackFnsRef.current) {
                rollback();
              }
              rollbackFnsRef.current = [];

              // Clear loading timeout
              if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
              }

              const error = err as TError;

              // Update state
              setState({
                isPending: false,
                isSuccess: false,
                isError: true,
                data: undefined,
                error,
              });

              // Call error handlers
              onError?.(error, variables, context);
              onSettled?.(undefined, error, variables, context);

              resolve();
            }
          });
        });
      } catch (err) {
        // Handle any synchronous errors
        for (const rollback of rollbackFnsRef.current) {
          rollback();
        }

        const error = err as TError;
        setState({
          isPending: false,
          isSuccess: false,
          isError: true,
          data: undefined,
          error,
        });

        onError?.(error, variables, context);
        onSettled?.(undefined, error, variables, context);
      }
    },
    [
      mutationFn,
      optimisticUpdate,
      onSuccess,
      onError,
      onSettled,
      invalidateKeys,
      loadingDelay,
      queryClient,
      startTransition,
    ]
  );

  const reset = useCallback(() => {
    setState({
      isPending: false,
      isSuccess: false,
      isError: false,
      data: undefined,
      error: null,
    });
  }, []);

  return {
    mutate,
    reset,
    isPending: state.isPending || isPending,
    isSuccess: state.isSuccess,
    isError: state.isError,
    data: state.data,
    error: state.error,
  };
}

/**
 * Simplified hook for common toggle/status mutations
 * Provides instant visual feedback for boolean state changes
 */
export function useOptimisticToggle<T extends { id: string }>(options: {
  queryKey: unknown[];
  toggleKey: keyof T;
  mutationFn: (id: string, newValue: boolean) => Promise<T>;
  onSuccess?: (item: T) => void;
  onError?: (error: Error) => void;
}) {
  const { queryKey, toggleKey, mutationFn, onSuccess, onError } = options;

  return useOptimisticMutation<T, Error, { id: string; newValue: boolean }>({
    mutationFn: ({ id, newValue }) => mutationFn(id, newValue),
    optimisticUpdate: ({ id, newValue }) => ({
      queryKey,
      updater: (old: T[] | undefined) =>
        (old ?? []).map((item) =>
          item.id === id ? { ...item, [toggleKey]: newValue } : item
        ) as unknown as T,
    }),
    onSuccess: (data) => onSuccess?.(data),
    onError: (error) => onError?.(error),
    invalidateKeys: [queryKey],
  });
}

/**
 * Hook for list item mutations (create, update, delete)
 * Handles optimistic additions, updates, and removals
 */
export function useOptimisticList<T extends { id: string }>(options: {
  queryKey: unknown[];
  createFn?: (data: Omit<T, 'id'>) => Promise<T>;
  updateFn?: (id: string, data: Partial<T>) => Promise<T>;
  deleteFn?: (id: string) => Promise<boolean>;
  onSuccess?: (action: 'create' | 'update' | 'delete', item?: T) => void;
  onError?: (action: 'create' | 'update' | 'delete', error: Error) => void;
}) {
  const { queryKey, createFn, updateFn, deleteFn, onSuccess, onError } = options;
  const queryClient = useQueryClient();

  const createMutation = useOptimisticMutation<T, Error, Omit<T, 'id'>>({
    mutationFn: async (data) => {
      if (!createFn) throw new Error('createFn not provided');
      return createFn(data);
    },
    optimisticUpdate: (data) => ({
      queryKey,
      updater: (old: T[] | undefined) => [
        { ...data, id: `temp-${Date.now()}` } as T,
        ...(old ?? []),
      ] as unknown as T,
    }),
    onSuccess: (item) => onSuccess?.('create', item),
    onError: (error) => onError?.('create', error),
    invalidateKeys: [queryKey],
  });

  const updateMutation = useOptimisticMutation<T, Error, { id: string; data: Partial<T> }>({
    mutationFn: async ({ id, data }) => {
      if (!updateFn) throw new Error('updateFn not provided');
      return updateFn(id, data);
    },
    optimisticUpdate: ({ id, data }) => ({
      queryKey,
      updater: (old: T[] | undefined) =>
        (old ?? []).map((item) =>
          item.id === id ? { ...item, ...data } : item
        ) as unknown as T,
    }),
    onSuccess: (item) => onSuccess?.('update', item),
    onError: (error) => onError?.('update', error),
    invalidateKeys: [queryKey],
  });

  const deleteMutation = useOptimisticMutation<boolean, Error, string>({
    mutationFn: async (id) => {
      if (!deleteFn) throw new Error('deleteFn not provided');
      return deleteFn(id);
    },
    optimisticUpdate: (id) => ({
      queryKey,
      updater: (old: T[] | undefined) =>
        (old ?? []).filter((item) => item.id !== id) as unknown as boolean,
    }),
    onSuccess: () => onSuccess?.('delete'),
    onError: (error) => onError?.('delete', error),
    invalidateKeys: [queryKey],
  });

  return {
    create: createMutation,
    update: updateMutation,
    delete: deleteMutation,
    // Helper to get current list
    getData: () => queryClient.getQueryData<T[]>(queryKey),
  };
}
