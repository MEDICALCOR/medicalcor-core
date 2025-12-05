import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useOptimisticMutation,
  useOptimisticToggle,
  useOptimisticList,
} from '@/lib/mutations/use-optimistic-mutation';
import { ReactNode } from 'react';

// Shared QueryClient reference for cleanup
let activeQueryClient: QueryClient | null = null;

// Create a wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  activeQueryClient = queryClient;

  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe('useOptimisticMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up QueryClient to prevent state leakage
    activeQueryClient?.clear();
    activeQueryClient = null;
  });

  it('should execute mutation and update state on success', async () => {
    const { wrapper } = createWrapper();
    const mockMutationFn = vi.fn().mockResolvedValue({ id: '1', name: 'Updated' });
    const onSuccess = vi.fn();

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: mockMutationFn,
          onSuccess,
        }),
      { wrapper }
    );

    expect(result.current.isPending).toBe(false);
    expect(result.current.isSuccess).toBe(false);

    await act(async () => {
      await result.current.mutate({ name: 'Updated' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockMutationFn).toHaveBeenCalledWith({ name: 'Updated' });
    expect(onSuccess).toHaveBeenCalled();
    expect(result.current.data).toEqual({ id: '1', name: 'Updated' });
  });

  it('should handle errors and call onError', async () => {
    const { wrapper } = createWrapper();
    const error = new Error('Mutation failed');
    const mockMutationFn = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: mockMutationFn,
          onError,
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutate({ name: 'Test' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(onError).toHaveBeenCalledWith(error, { name: 'Test' }, undefined);
    expect(result.current.error).toBe(error);
  });

  it('should apply optimistic update immediately', async () => {
    const { queryClient, wrapper } = createWrapper();
    const queryKey = ['test-items'];

    // Set initial data
    queryClient.setQueryData(queryKey, [{ id: '1', name: 'Original' }]);

    const mockMutationFn = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ id: '1', name: 'Updated' }), 100))
      );

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: mockMutationFn,
          optimisticUpdate: (variables: { id: string; name: string }) => ({
            queryKey,
            updater: (old: { id: string; name: string }[] | undefined) =>
              (old ?? []).map((item) =>
                item.id === variables.id ? { ...item, name: variables.name } : item
              ),
          }),
        }),
      { wrapper }
    );

    // Start mutation (don't await)
    act(() => {
      result.current.mutate({ id: '1', name: 'Optimistic' });
    });

    // Check optimistic update was applied immediately
    const dataAfterOptimistic = queryClient.getQueryData(queryKey);
    expect(dataAfterOptimistic).toEqual([{ id: '1', name: 'Optimistic' }]);
  });

  it('should rollback optimistic update on error', async () => {
    const { queryClient, wrapper } = createWrapper();
    const queryKey = ['test-rollback'];

    // Set initial data
    queryClient.setQueryData(queryKey, [{ id: '1', name: 'Original' }]);

    const mockMutationFn = vi.fn().mockRejectedValue(new Error('Failed'));

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: mockMutationFn,
          optimisticUpdate: (variables: { id: string; name: string }) => ({
            queryKey,
            updater: (old: { id: string; name: string }[] | undefined) =>
              (old ?? []).map((item) =>
                item.id === variables.id ? { ...item, name: variables.name } : item
              ),
          }),
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutate({ id: '1', name: 'Should Rollback' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Check data was rolled back
    const dataAfterRollback = queryClient.getQueryData(queryKey);
    expect(dataAfterRollback).toEqual([{ id: '1', name: 'Original' }]);
  });

  it('should call onSettled after success', async () => {
    const { wrapper } = createWrapper();
    const mockMutationFn = vi.fn().mockResolvedValue({ id: '1' });
    const onSettled = vi.fn();

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: mockMutationFn,
          onSettled,
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutate({});
    });

    await waitFor(() => {
      expect(onSettled).toHaveBeenCalledWith({ id: '1' }, null, {}, undefined);
    });
  });

  it('should call onSettled after error', async () => {
    const { wrapper } = createWrapper();
    const error = new Error('Failed');
    const mockMutationFn = vi.fn().mockRejectedValue(error);
    const onSettled = vi.fn();

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: mockMutationFn,
          onSettled,
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutate({});
    });

    await waitFor(() => {
      expect(onSettled).toHaveBeenCalledWith(undefined, error, {}, undefined);
    });
  });

  it('should reset state', async () => {
    const { wrapper } = createWrapper();
    const mockMutationFn = vi.fn().mockResolvedValue({ id: '1' });

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: mockMutationFn,
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutate({});
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.isSuccess).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('should invalidate queries after success', async () => {
    const { queryClient, wrapper } = createWrapper();
    const queryKey = ['to-invalidate'];
    const mockMutationFn = vi.fn().mockResolvedValue({ id: '1' });

    // Set initial data and spy on invalidation
    queryClient.setQueryData(queryKey, []);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: mockMutationFn,
          invalidateKeys: [queryKey],
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutate({});
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey });
    });
  });
});

describe('useOptimisticToggle', () => {
  it('should toggle boolean value optimistically', async () => {
    const { queryClient, wrapper } = createWrapper();
    const queryKey = ['toggleable-items'];

    queryClient.setQueryData(queryKey, [
      { id: '1', isActive: false },
      { id: '2', isActive: true },
    ]);

    const mockMutationFn = vi.fn().mockResolvedValue({ id: '1', isActive: true });

    const { result } = renderHook(
      () =>
        useOptimisticToggle<{ id: string; isActive: boolean }>({
          queryKey,
          toggleKey: 'isActive',
          mutationFn: mockMutationFn,
        }),
      { wrapper }
    );

    act(() => {
      result.current.mutate({ id: '1', newValue: true });
    });

    // Check optimistic update
    const data = queryClient.getQueryData(queryKey) as { id: string; isActive: boolean }[];
    expect(data.find((i) => i.id === '1')?.isActive).toBe(true);
  });
});

describe('useOptimisticList', () => {
  it('should create item optimistically', async () => {
    const { queryClient, wrapper } = createWrapper();
    const queryKey = ['list-items'];

    queryClient.setQueryData(queryKey, [{ id: '1', name: 'Existing' }]);

    const mockCreateFn = vi.fn().mockResolvedValue({ id: '2', name: 'New Item' });

    const { result } = renderHook(
      () =>
        useOptimisticList<{ id: string; name: string }>({
          queryKey,
          createFn: mockCreateFn,
        }),
      { wrapper }
    );

    act(() => {
      result.current.create.mutate({ name: 'New Item' });
    });

    // Check optimistic update added item at beginning
    const data = queryClient.getQueryData(queryKey) as { id: string; name: string }[];
    expect(data.length).toBe(2);
    expect(data[0].name).toBe('New Item');
    expect(data[0].id).toMatch(/^temp-/); // Temporary ID
  });

  it('should update item optimistically', async () => {
    const { queryClient, wrapper } = createWrapper();
    const queryKey = ['update-list'];

    queryClient.setQueryData(queryKey, [
      { id: '1', name: 'Original' },
      { id: '2', name: 'Other' },
    ]);

    const mockUpdateFn = vi.fn().mockResolvedValue({ id: '1', name: 'Updated' });

    const { result } = renderHook(
      () =>
        useOptimisticList<{ id: string; name: string }>({
          queryKey,
          updateFn: mockUpdateFn,
        }),
      { wrapper }
    );

    act(() => {
      result.current.update.mutate({ id: '1', data: { name: 'Updated' } });
    });

    const data = queryClient.getQueryData(queryKey) as { id: string; name: string }[];
    expect(data.find((i) => i.id === '1')?.name).toBe('Updated');
    expect(data.find((i) => i.id === '2')?.name).toBe('Other'); // Unchanged
  });

  it('should delete item optimistically', async () => {
    const { queryClient, wrapper } = createWrapper();
    const queryKey = ['delete-list'];

    queryClient.setQueryData(queryKey, [
      { id: '1', name: 'To Delete' },
      { id: '2', name: 'Keep' },
    ]);

    const mockDeleteFn = vi.fn().mockResolvedValue(true);

    const { result } = renderHook(
      () =>
        useOptimisticList<{ id: string; name: string }>({
          queryKey,
          deleteFn: mockDeleteFn,
        }),
      { wrapper }
    );

    act(() => {
      result.current.delete.mutate('1');
    });

    const data = queryClient.getQueryData(queryKey) as { id: string; name: string }[];
    expect(data.length).toBe(1);
    expect(data[0].id).toBe('2');
  });

  it('should get current data', () => {
    const { queryClient, wrapper } = createWrapper();
    const queryKey = ['get-data-list'];
    const initialData = [{ id: '1', name: 'Item' }];

    queryClient.setQueryData(queryKey, initialData);

    const { result } = renderHook(
      () =>
        useOptimisticList<{ id: string; name: string }>({
          queryKey,
        }),
      { wrapper }
    );

    expect(result.current.getData()).toEqual(initialData);
  });
});

describe('useOptimisticMutation - Concurrent Mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    activeQueryClient?.clear();
    activeQueryClient = null;
  });

  it('should handle multiple concurrent mutations without interference', async () => {
    const { queryClient, wrapper } = createWrapper();
    const queryKey = ['concurrent-items'];

    queryClient.setQueryData(queryKey, [
      { id: '1', name: 'Item 1' },
      { id: '2', name: 'Item 2' },
      { id: '3', name: 'Item 3' },
    ]);

    // Create delayed mutation functions
    const mutation1 = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve({ id: '1', name: 'Updated 1' }), 100))
      );
    const mutation2 = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve({ id: '2', name: 'Updated 2' }), 50))
      );
    const mutation3 = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve({ id: '3', name: 'Updated 3' }), 150))
      );

    const { result: result1 } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: mutation1,
          optimisticUpdate: (vars: { id: string; name: string }) => ({
            queryKey,
            updater: (old: { id: string; name: string }[] | undefined) =>
              (old ?? []).map((item) =>
                item.id === vars.id ? { ...item, name: vars.name } : item
              ),
          }),
        }),
      { wrapper }
    );

    const { result: result2 } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: mutation2,
          optimisticUpdate: (vars: { id: string; name: string }) => ({
            queryKey,
            updater: (old: { id: string; name: string }[] | undefined) =>
              (old ?? []).map((item) =>
                item.id === vars.id ? { ...item, name: vars.name } : item
              ),
          }),
        }),
      { wrapper }
    );

    const { result: result3 } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: mutation3,
          optimisticUpdate: (vars: { id: string; name: string }) => ({
            queryKey,
            updater: (old: { id: string; name: string }[] | undefined) =>
              (old ?? []).map((item) =>
                item.id === vars.id ? { ...item, name: vars.name } : item
              ),
          }),
        }),
      { wrapper }
    );

    // Fire all mutations nearly simultaneously
    act(() => {
      result1.current.mutate({ id: '1', name: 'Optimistic 1' });
      result2.current.mutate({ id: '2', name: 'Optimistic 2' });
      result3.current.mutate({ id: '3', name: 'Optimistic 3' });
    });

    // Verify all optimistic updates applied immediately
    const dataAfterOptimistic = queryClient.getQueryData(queryKey) as {
      id: string;
      name: string;
    }[];
    expect(dataAfterOptimistic.find((i) => i.id === '1')?.name).toBe('Optimistic 1');
    expect(dataAfterOptimistic.find((i) => i.id === '2')?.name).toBe('Optimistic 2');
    expect(dataAfterOptimistic.find((i) => i.id === '3')?.name).toBe('Optimistic 3');

    // Wait for all mutations to complete
    await waitFor(() => {
      expect(result1.current.isSuccess).toBe(true);
      expect(result2.current.isSuccess).toBe(true);
      expect(result3.current.isSuccess).toBe(true);
    });

    // All mutations should have been called
    expect(mutation1).toHaveBeenCalledTimes(1);
    expect(mutation2).toHaveBeenCalledTimes(1);
    expect(mutation3).toHaveBeenCalledTimes(1);
  });

  it('should correctly rollback only failed mutation in concurrent scenario', async () => {
    const { queryClient, wrapper } = createWrapper();
    const queryKey = ['concurrent-rollback'];

    queryClient.setQueryData(queryKey, [
      { id: '1', name: 'Original 1' },
      { id: '2', name: 'Original 2' },
    ]);

    // First mutation succeeds, second fails
    const successMutation = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ id: '1', name: 'Success' }), 50))
      );
    const failMutation = vi
      .fn()
      .mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Failed')), 100))
      );

    const { result: successResult } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: successMutation,
          optimisticUpdate: (vars: { id: string; name: string }) => ({
            queryKey,
            updater: (old: { id: string; name: string }[] | undefined) =>
              (old ?? []).map((item) =>
                item.id === vars.id ? { ...item, name: vars.name } : item
              ),
          }),
        }),
      { wrapper }
    );

    const { result: failResult } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: failMutation,
          optimisticUpdate: (vars: { id: string; name: string }) => ({
            queryKey,
            updater: (old: { id: string; name: string }[] | undefined) =>
              (old ?? []).map((item) =>
                item.id === vars.id ? { ...item, name: vars.name } : item
              ),
          }),
        }),
      { wrapper }
    );

    // Fire both mutations
    act(() => {
      successResult.current.mutate({ id: '1', name: 'Optimistic Success' });
      failResult.current.mutate({ id: '2', name: 'Optimistic Fail' });
    });

    // Wait for both to settle
    await waitFor(() => {
      expect(successResult.current.isSuccess).toBe(true);
      expect(failResult.current.isError).toBe(true);
    });

    // Check final state - item 2 should be rolled back to original
    const finalData = queryClient.getQueryData(queryKey) as { id: string; name: string }[];
    expect(finalData.find((i) => i.id === '2')?.name).toBe('Original 2');
  });

  it('should handle rapid fire mutations on same item', async () => {
    const { queryClient, wrapper } = createWrapper();
    const queryKey = ['rapid-fire'];

    queryClient.setQueryData(queryKey, [{ id: '1', name: 'Original', count: 0 }]);

    const mutationFn = vi
      .fn()
      .mockImplementation(
        (vars: { id: string; count: number }) =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ id: '1', name: 'Updated', count: vars.count }), 10)
          )
      );

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn,
          optimisticUpdate: (vars: { id: string; count: number }) => ({
            queryKey,
            updater: (old: { id: string; name: string; count: number }[] | undefined) =>
              (old ?? []).map((item) =>
                item.id === vars.id ? { ...item, count: vars.count } : item
              ),
          }),
        }),
      { wrapper }
    );

    // Fire 5 mutations rapidly
    act(() => {
      result.current.mutate({ id: '1', count: 1 });
      result.current.mutate({ id: '1', count: 2 });
      result.current.mutate({ id: '1', count: 3 });
      result.current.mutate({ id: '1', count: 4 });
      result.current.mutate({ id: '1', count: 5 });
    });

    // Last optimistic update should be visible
    const dataAfterOptimistic = queryClient.getQueryData(queryKey) as {
      id: string;
      count: number;
    }[];
    expect(dataAfterOptimistic[0].count).toBe(5);

    // All mutations should eventually complete
    await waitFor(() => {
      expect(mutationFn).toHaveBeenCalledTimes(5);
    });
  });
});
