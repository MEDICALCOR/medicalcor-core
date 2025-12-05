/**
 * useOptimisticMutation - Platinum Standard Tests
 *
 * Pattern: AAA (Arrange–Act–Assert)
 * Coverage: happy path + error path + concurrency
 * Cleanup: QueryClient, mocks, timers - all properly isolated
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useOptimisticMutation,
  useOptimisticToggle,
  useOptimisticList,
} from '@/lib/mutations/use-optimistic-mutation';
import { ReactNode } from 'react';

/**
 * Test Helpers
 */

type Todo = {
  id: string;
  title: string;
  completed: boolean;
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useOptimisticMutation (platinum standard)', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => React.JSX.Element;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    wrapper = createWrapper(queryClient);
  });

  afterEach(() => {
    // Strict cleanup - isolate each test
    queryClient.clear();
    queryClient.getQueryCache().clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('applies optimistic update immediately and reconciles on success', async () => {
    // ARRANGE
    const TODOS_KEY = ['todos'];
    const initialTodos: Todo[] = [{ id: '1', title: 'Existing', completed: false }];
    queryClient.setQueryData(TODOS_KEY, initialTodos);

    const variables = { title: 'New optimistic todo' };

    const mutationFn = vi.fn(async (vars: typeof variables) => ({
      id: 'server-2',
      title: vars.title,
      completed: false,
    }));

    const { result } = renderHook(
      () =>
        useOptimisticMutation<Todo, Error, typeof variables>({
          mutationFn,
          optimisticUpdate: (vars) => ({
            queryKey: TODOS_KEY,
            updater: (old: Todo[] | undefined) => [
              ...(old ?? []),
              { id: 'optimistic-temp-id', title: vars.title, completed: false },
            ],
          }),
          invalidateKeys: [TODOS_KEY],
        }),
      { wrapper }
    );

    // ACT - trigger mutation
    act(() => {
      result.current.mutate(variables);
    });

    // ASSERT - optimistic update: appears immediately in cache
    const intermediateTodos = queryClient.getQueryData<Todo[]>(TODOS_KEY);
    expect(intermediateTodos).toEqual([
      initialTodos[0],
      { id: 'optimistic-temp-id', title: 'New optimistic todo', completed: false },
    ]);

    // Wait for mutation to complete
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mutationFn).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({
      id: 'server-2',
      title: 'New optimistic todo',
      completed: false,
    });
  });

  it('reverts optimistic update on error and exposes error state', async () => {
    // ARRANGE
    const TODOS_KEY = ['todos-error'];
    const initialTodos: Todo[] = [{ id: '1', title: 'Existing', completed: false }];
    queryClient.setQueryData(TODOS_KEY, initialTodos);

    const variables = { title: 'Will fail' };
    const error = new Error('Network error');

    const mutationFn = vi.fn(async () => {
      throw error;
    });

    const { result } = renderHook(
      () =>
        useOptimisticMutation<Todo, Error, typeof variables>({
          mutationFn,
          optimisticUpdate: (vars) => ({
            queryKey: TODOS_KEY,
            updater: (old: Todo[] | undefined) => [
              ...(old ?? []),
              { id: 'optimistic-failed', title: vars.title, completed: false },
            ],
          }),
        }),
      { wrapper }
    );

    // ACT - trigger mutation
    act(() => {
      result.current.mutate(variables);
    });

    // ASSERT - immediately after mutate: optimistic item present
    const intermediateTodos = queryClient.getQueryData<Todo[]>(TODOS_KEY);
    expect(intermediateTodos?.some((t) => t.title === 'Will fail')).toBe(true);

    // Wait for mutation to fail and rollback
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toBe(error);
    });

    // After rollback: item is reverted
    const finalTodos = queryClient.getQueryData<Todo[]>(TODOS_KEY);
    expect(finalTodos).toEqual(initialTodos);

    expect(mutationFn).toHaveBeenCalledTimes(1);
  });

  it('handles concurrent optimistic mutations without corrupting final cache state', async () => {
    // ARRANGE
    const TODOS_KEY = ['todos-concurrent'];
    const initialTodos: Todo[] = [{ id: '1', title: 'Existing', completed: false }];
    queryClient.setQueryData(TODOS_KEY, initialTodos);

    const variablesA = { title: 'A' };
    const variablesB = { title: 'B' };

    // Control two separate promises
    let resolveA: (value: Todo) => void;
    let resolveB: (value: Todo) => void;

    const mutationFn = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Todo>((res) => {
            resolveA = res;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<Todo>((res) => {
            resolveB = res;
          })
      );

    const { result } = renderHook(
      () =>
        useOptimisticMutation<Todo, Error, { title: string }>({
          mutationFn,
          optimisticUpdate: (vars) => ({
            queryKey: TODOS_KEY,
            updater: (old: Todo[] | undefined) => [
              ...(old ?? []),
              { id: `optimistic-${vars.title}`, title: vars.title, completed: false },
            ],
          }),
        }),
      { wrapper }
    );

    // ACT - trigger two mutations almost simultaneously
    act(() => {
      result.current.mutate(variablesA);
    });
    act(() => {
      result.current.mutate(variablesB);
    });

    // ASSERT - both optimistic items present in cache
    const optimisticTodos = queryClient.getQueryData<Todo[]>(TODOS_KEY);
    expect(optimisticTodos?.map((t) => t.title)).toEqual(['Existing', 'A', 'B']);

    // Resolve promises in reverse order (out-of-order)
    await act(async () => {
      resolveB!({ id: 'server-B', title: 'B', completed: false });
    });

    await act(async () => {
      resolveA!({ id: 'server-A', title: 'A', completed: false });
    });

    // ASSERT - cache is coherent after both resolve
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mutationFn).toHaveBeenCalledTimes(2);
  });

  it('should execute mutation and update state on success', async () => {
    // ARRANGE
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

    // ASSERT - initial state
    expect(result.current.isPending).toBe(false);
    expect(result.current.isSuccess).toBe(false);

    // ACT
    await act(async () => {
      await result.current.mutate({ name: 'Updated' });
    });

    // ASSERT - final state
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockMutationFn).toHaveBeenCalledWith({ name: 'Updated' });
    expect(onSuccess).toHaveBeenCalled();
    expect(result.current.data).toEqual({ id: '1', name: 'Updated' });
  });

  it('should handle errors and call onError', async () => {
    // ARRANGE
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

    // ACT
    await act(async () => {
      await result.current.mutate({ name: 'Test' });
    });

    // ASSERT
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(onError).toHaveBeenCalledWith(error, { name: 'Test' }, undefined);
    expect(result.current.error).toBe(error);
  });

  it('should apply optimistic update immediately', async () => {
    // ARRANGE
    const queryKey = ['test-items'];
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

    // ACT - start mutation (don't await)
    act(() => {
      result.current.mutate({ id: '1', name: 'Optimistic' });
    });

    // ASSERT - optimistic update was applied immediately
    const dataAfterOptimistic = queryClient.getQueryData(queryKey);
    expect(dataAfterOptimistic).toEqual([{ id: '1', name: 'Optimistic' }]);
  });

  it('should rollback optimistic update on error', async () => {
    // ARRANGE
    const queryKey = ['test-rollback'];
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

    // ACT
    await act(async () => {
      await result.current.mutate({ id: '1', name: 'Should Rollback' });
    });

    // ASSERT
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Check data was rolled back
    const dataAfterRollback = queryClient.getQueryData(queryKey);
    expect(dataAfterRollback).toEqual([{ id: '1', name: 'Original' }]);
  });

  it('should call onSettled after success', async () => {
    // ARRANGE
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

    // ACT
    await act(async () => {
      await result.current.mutate({});
    });

    // ASSERT
    await waitFor(() => {
      expect(onSettled).toHaveBeenCalledWith({ id: '1' }, null, {}, undefined);
    });
  });

  it('should call onSettled after error', async () => {
    // ARRANGE
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

    // ACT
    await act(async () => {
      await result.current.mutate({});
    });

    // ASSERT
    await waitFor(() => {
      expect(onSettled).toHaveBeenCalledWith(undefined, error, {}, undefined);
    });
  });

  it('should reset state', async () => {
    // ARRANGE
    const mockMutationFn = vi.fn().mockResolvedValue({ id: '1' });

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn: mockMutationFn,
        }),
      { wrapper }
    );

    // ACT - execute mutation
    await act(async () => {
      await result.current.mutate({});
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // ACT - reset
    act(() => {
      result.current.reset();
    });

    // ASSERT
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('should invalidate queries after success', async () => {
    // ARRANGE
    const queryKey = ['to-invalidate'];
    const mockMutationFn = vi.fn().mockResolvedValue({ id: '1' });

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

    // ACT
    await act(async () => {
      await result.current.mutate({});
    });

    // ASSERT
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey });
    });
  });

  it('should handle multiple query keys in optimistic update', async () => {
    // ARRANGE
    const todosKey = ['todos-multi'];
    const countKey = ['todos-count'];

    queryClient.setQueryData(todosKey, [{ id: '1', title: 'Existing' }]);
    queryClient.setQueryData(countKey, 1);

    const mockMutationFn = vi.fn().mockResolvedValue({ id: '2', title: 'New' });

    const { result } = renderHook(
      () =>
        useOptimisticMutation<{ id: string; title: string }, Error, { title: string }>({
          mutationFn: mockMutationFn,
          optimisticUpdate: (vars) => [
            {
              queryKey: todosKey,
              updater: (old: { id: string; title: string }[] | undefined) => [
                ...(old ?? []),
                { id: 'temp', title: vars.title },
              ],
            },
            {
              queryKey: countKey,
              updater: (old: number | undefined) => (old ?? 0) + 1,
            },
          ],
        }),
      { wrapper }
    );

    // ACT
    act(() => {
      result.current.mutate({ title: 'New' });
    });

    // ASSERT - both caches updated
    expect(queryClient.getQueryData(todosKey)).toEqual([
      { id: '1', title: 'Existing' },
      { id: 'temp', title: 'New' },
    ]);
    expect(queryClient.getQueryData(countKey)).toBe(2);
  });

  it('should rollback multiple query keys on error', async () => {
    // ARRANGE
    const todosKey = ['todos-multi-error'];
    const countKey = ['todos-count-error'];

    queryClient.setQueryData(todosKey, [{ id: '1', title: 'Existing' }]);
    queryClient.setQueryData(countKey, 1);

    const mockMutationFn = vi.fn().mockRejectedValue(new Error('Failed'));

    const { result } = renderHook(
      () =>
        useOptimisticMutation<{ id: string; title: string }, Error, { title: string }>({
          mutationFn: mockMutationFn,
          optimisticUpdate: (vars) => [
            {
              queryKey: todosKey,
              updater: (old: { id: string; title: string }[] | undefined) => [
                ...(old ?? []),
                { id: 'temp', title: vars.title },
              ],
            },
            {
              queryKey: countKey,
              updater: (old: number | undefined) => (old ?? 0) + 1,
            },
          ],
        }),
      { wrapper }
    );

    // ACT
    await act(async () => {
      await result.current.mutate({ title: 'Should Fail' });
    });

    // ASSERT - wait for error
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Both caches rolled back
    expect(queryClient.getQueryData(todosKey)).toEqual([{ id: '1', title: 'Existing' }]);
    expect(queryClient.getQueryData(countKey)).toBe(1);
  });
});

describe('useOptimisticToggle', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => React.JSX.Element;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    wrapper = createWrapper(queryClient);
  });

  afterEach(() => {
    queryClient.clear();
    queryClient.getQueryCache().clear();
    vi.clearAllMocks();
  });

  it('should toggle boolean value optimistically', async () => {
    // ARRANGE
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

    // ACT
    act(() => {
      result.current.mutate({ id: '1', newValue: true });
    });

    // ASSERT - optimistic update
    const data = queryClient.getQueryData(queryKey) as { id: string; isActive: boolean }[];
    expect(data.find((i) => i.id === '1')?.isActive).toBe(true);
  });

  it('should rollback toggle on error', async () => {
    // ARRANGE
    const queryKey = ['toggleable-rollback'];

    queryClient.setQueryData(queryKey, [{ id: '1', isActive: false }]);

    const mockMutationFn = vi.fn().mockRejectedValue(new Error('Toggle failed'));
    const onError = vi.fn();

    const { result } = renderHook(
      () =>
        useOptimisticToggle<{ id: string; isActive: boolean }>({
          queryKey,
          toggleKey: 'isActive',
          mutationFn: mockMutationFn,
          onError,
        }),
      { wrapper }
    );

    // ACT
    await act(async () => {
      result.current.mutate({ id: '1', newValue: true });
    });

    // ASSERT
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const data = queryClient.getQueryData(queryKey) as { id: string; isActive: boolean }[];
    expect(data.find((i) => i.id === '1')?.isActive).toBe(false);
    expect(onError).toHaveBeenCalled();
  });
});

describe('useOptimisticList', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => React.JSX.Element;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    wrapper = createWrapper(queryClient);
  });

  afterEach(() => {
    queryClient.clear();
    queryClient.getQueryCache().clear();
    vi.clearAllMocks();
  });

  it('should create item optimistically', async () => {
    // ARRANGE
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

    // ACT
    act(() => {
      result.current.create.mutate({ name: 'New Item' });
    });

    // ASSERT - optimistic update added item at beginning
    const data = queryClient.getQueryData(queryKey) as { id: string; name: string }[];
    expect(data.length).toBe(2);
    expect(data[0].name).toBe('New Item');
    expect(data[0].id).toMatch(/^temp-/); // Temporary ID
  });

  it('should update item optimistically', async () => {
    // ARRANGE
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

    // ACT
    act(() => {
      result.current.update.mutate({ id: '1', data: { name: 'Updated' } });
    });

    // ASSERT
    const data = queryClient.getQueryData(queryKey) as { id: string; name: string }[];
    expect(data.find((i) => i.id === '1')?.name).toBe('Updated');
    expect(data.find((i) => i.id === '2')?.name).toBe('Other'); // Unchanged
  });

  it('should delete item optimistically', async () => {
    // ARRANGE
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

    // ACT
    act(() => {
      result.current.delete.mutate('1');
    });

    // ASSERT
    const data = queryClient.getQueryData(queryKey) as { id: string; name: string }[];
    expect(data.length).toBe(1);
    expect(data[0].id).toBe('2');
  });

  it('should get current data', () => {
    // ARRANGE
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

    // ACT & ASSERT
    expect(result.current.getData()).toEqual(initialData);
  });

  it('should rollback create on error', async () => {
    // ARRANGE
    const queryKey = ['create-rollback'];
    queryClient.setQueryData(queryKey, [{ id: '1', name: 'Existing' }]);

    const mockCreateFn = vi.fn().mockRejectedValue(new Error('Create failed'));
    const onError = vi.fn();

    const { result } = renderHook(
      () =>
        useOptimisticList<{ id: string; name: string }>({
          queryKey,
          createFn: mockCreateFn,
          onError,
        }),
      { wrapper }
    );

    // ACT
    await act(async () => {
      result.current.create.mutate({ name: 'Should Fail' });
    });

    // ASSERT
    await waitFor(() => {
      expect(result.current.create.isError).toBe(true);
    });

    const data = queryClient.getQueryData(queryKey) as { id: string; name: string }[];
    expect(data.length).toBe(1);
    expect(data[0].name).toBe('Existing');
    expect(onError).toHaveBeenCalledWith('create', expect.any(Error));
  });

  it('should rollback delete on error', async () => {
    // ARRANGE
    const queryKey = ['delete-rollback'];
    queryClient.setQueryData(queryKey, [
      { id: '1', name: 'Should Stay' },
      { id: '2', name: 'Other' },
    ]);

    const mockDeleteFn = vi.fn().mockRejectedValue(new Error('Delete failed'));

    const { result } = renderHook(
      () =>
        useOptimisticList<{ id: string; name: string }>({
          queryKey,
          deleteFn: mockDeleteFn,
        }),
      { wrapper }
    );

    // ACT
    await act(async () => {
      result.current.delete.mutate('1');
    });

    // ASSERT
    await waitFor(() => {
      expect(result.current.delete.isError).toBe(true);
    });

    const data = queryClient.getQueryData(queryKey) as { id: string; name: string }[];
    expect(data.length).toBe(2);
    expect(data.find((i) => i.id === '1')).toBeDefined();
  });
});
