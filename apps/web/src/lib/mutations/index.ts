/**
 * Optimistic Mutation Hooks
 *
 * Provides instant UI updates with automatic rollback on failure.
 * This is the key to "perceived speed" - the secret of Apple-level UX.
 *
 * Example usage:
 * ```tsx
 * // Toggle workflow active status - instant feedback
 * const { mutate: toggleActive } = useOptimisticToggle({
 *   queryKey: ['workflows'],
 *   toggleKey: 'isActive',
 *   mutationFn: toggleWorkflowAction,
 * });
 *
 * // Click handler - no loading spinner needed!
 * <Switch
 *   checked={workflow.isActive}
 *   onCheckedChange={(checked) => toggleActive({ id: workflow.id, newValue: checked })}
 * />
 * ```
 */

export {
  useOptimisticMutation,
  useOptimisticToggle,
  useOptimisticList,
  type OptimisticUpdateConfig,
  type UseOptimisticMutationOptions,
} from './use-optimistic-mutation';

export { useWorkflowMutations } from './use-workflow-mutations';
