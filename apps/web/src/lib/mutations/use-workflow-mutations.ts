'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useOptimisticMutation, useOptimisticToggle } from './use-optimistic-mutation';
import {
  createWorkflowAction,
  updateWorkflowAction,
  deleteWorkflowAction,
  toggleWorkflowAction,
  duplicateWorkflowAction,
  type Workflow,
} from '@/app/actions/workflows';

/**
 * Workflow Query Keys
 * Centralized for cache invalidation consistency
 */
export const workflowKeys = {
  all: ['workflows'] as const,
  lists: () => [...workflowKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...workflowKeys.lists(), filters] as const,
  details: () => [...workflowKeys.all, 'detail'] as const,
  detail: (id: string) => [...workflowKeys.details(), id] as const,
};

/**
 * Hook for workflow mutations with Optimistic UI
 *
 * All mutations provide instant visual feedback:
 * - Toggle active: Switch updates immediately
 * - Delete: Item disappears instantly
 * - Create: New item appears at top
 * - Update: Changes reflect immediately
 *
 * If server fails, changes automatically roll back with notification.
 */
export function useWorkflowMutations(options?: {
  onSuccess?: (action: string, workflow?: Workflow) => void;
  onError?: (action: string, error: Error) => void;
}) {
  const queryClient = useQueryClient();
  const { onSuccess, onError } = options ?? {};

  /**
   * Toggle workflow active status
   * The switch updates BEFORE server responds
   */
  const toggleActive = useOptimisticToggle<Workflow>({
    queryKey: workflowKeys.all,
    toggleKey: 'isActive',
    mutationFn: (id, newValue) => toggleWorkflowAction(id, newValue),
    onSuccess: (workflow) => onSuccess?.('toggle', workflow),
    onError: (error) => onError?.('toggle', error),
  });

  /**
   * Create new workflow
   * Appears at top of list immediately with temporary ID
   */
  const create = useOptimisticMutation<
    Workflow,
    Error,
    Parameters<typeof createWorkflowAction>[0]
  >({
    mutationFn: createWorkflowAction,
    optimisticUpdate: (data) => ({
      queryKey: workflowKeys.all,
      updater: (old: Workflow[] | undefined) => {
        const tempWorkflow: Workflow = {
          id: `temp-${Date.now()}`,
          name: data.name,
          description: data.description,
          trigger: {
            id: `temp-trigger-${Date.now()}`,
            type: data.triggerType,
            config: data.triggerConfig ?? {},
          },
          steps: data.steps,
          isActive: data.isActive ?? false,
          executionCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return [tempWorkflow, ...(old ?? [])];
      },
    }),
    onSuccess: (workflow) => onSuccess?.('create', workflow),
    onError: (error) => onError?.('create', error),
    invalidateKeys: [workflowKeys.all],
  });

  /**
   * Update workflow
   * Changes reflect immediately in the UI
   */
  const update = useOptimisticMutation<
    Workflow,
    Error,
    Parameters<typeof updateWorkflowAction>[0]
  >({
    mutationFn: updateWorkflowAction,
    optimisticUpdate: (data) => ({
      queryKey: workflowKeys.all,
      updater: (old: Workflow[] | undefined) =>
        (old ?? []).map((w) =>
          w.id === data.id
            ? {
                ...w,
                ...data,
                trigger: data.triggerType
                  ? { ...w.trigger, type: data.triggerType, config: data.triggerConfig ?? w.trigger.config }
                  : w.trigger,
                steps: data.steps ?? w.steps,
                updatedAt: new Date(),
              }
            : w
        ),
    }),
    onSuccess: (workflow) => onSuccess?.('update', workflow),
    onError: (error) => onError?.('update', error),
    invalidateKeys: [workflowKeys.all],
  });

  /**
   * Delete workflow
   * Disappears from list immediately
   */
  const remove = useOptimisticMutation<boolean, Error, string>({
    mutationFn: deleteWorkflowAction,
    optimisticUpdate: (id) => ({
      queryKey: workflowKeys.all,
      updater: (old: Workflow[] | undefined) => (old ?? []).filter((w) => w.id !== id),
    }),
    onSuccess: () => onSuccess?.('delete'),
    onError: (error) => onError?.('delete', error),
    invalidateKeys: [workflowKeys.all],
  });

  /**
   * Duplicate workflow
   * Copy appears immediately below original
   */
  const duplicate = useOptimisticMutation<Workflow, Error, string>({
    mutationFn: duplicateWorkflowAction,
    optimisticUpdate: (id) => ({
      queryKey: workflowKeys.all,
      updater: (old: Workflow[] | undefined) => {
        const source = (old ?? []).find((w) => w.id === id);
        if (!source) return old ?? [];

        const index = (old ?? []).findIndex((w) => w.id === id);
        const tempDuplicate: Workflow = {
          ...source,
          id: `temp-${Date.now()}`,
          name: `${source.name} (Copie)`,
          isActive: false,
          executionCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = [...(old ?? [])];
        result.splice(index + 1, 0, tempDuplicate);
        return result;
      },
    }),
    onSuccess: (workflow) => onSuccess?.('duplicate', workflow),
    onError: (error) => onError?.('duplicate', error),
    invalidateKeys: [workflowKeys.all],
  });

  return {
    toggleActive,
    create,
    update,
    remove,
    duplicate,
    // Helper methods
    invalidate: () => queryClient.invalidateQueries({ queryKey: workflowKeys.all }),
    prefetch: (id: string) =>
      queryClient.prefetchQuery({
        queryKey: workflowKeys.detail(id),
        queryFn: () => import('@/app/actions/workflows').then((m) => m.getWorkflowByIdAction(id)),
      }),
  };
}
