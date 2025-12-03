'use client';

/**
 * React 19 Native Hooks
 *
 * This module exports React 19's built-in hooks for state management:
 * - useOptimistic: Optimistic state updates that auto-revert on error
 * - useFormStatus: Get pending state of parent form (for submit buttons)
 * - useActionState: Manage form action state with progressive enhancement
 *
 * @see https://react.dev/reference/react/useOptimistic
 * @see https://react.dev/reference/react-dom/hooks/useFormStatus
 */

import { useOptimistic, useActionState } from 'react';
import { useFormStatus } from 'react-dom';

// Re-export React 19 native hooks
export { useOptimistic, useFormStatus, useActionState };

/**
 * Type-safe wrapper for useOptimistic
 *
 * @example
 * ```tsx
 * const [optimisticItems, setOptimisticItems] = useOptimisticState(
 *   items,
 *   (state, newItem) => [...state, newItem]
 * );
 * ```
 */
export function useOptimisticState<TState, TAction>(
  state: TState,
  updateFn: (state: TState, action: TAction) => TState
) {
  return useOptimistic(state, updateFn);
}

/**
 * Form action state with loading indicator
 *
 * @example
 * ```tsx
 * const [state, formAction, isPending] = useFormAction(serverAction, initialState);
 * return <form action={formAction}>...</form>;
 * ```
 */
export function useFormAction<TState>(
  action: (prevState: TState, formData: FormData) => Promise<TState>,
  initialState: TState
) {
  return useActionState(action, initialState);
}
