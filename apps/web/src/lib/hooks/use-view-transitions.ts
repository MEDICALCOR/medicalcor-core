'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

/**
 * View Transitions API Hook
 *
 * Provides smooth, animated transitions between pages using the
 * native View Transitions API (Chrome 111+, Safari 18+).
 *
 * Falls back gracefully to standard navigation on unsupported browsers.
 *
 * @see https://developer.chrome.com/docs/web-platform/view-transitions/
 */

// Type for the View Transitions API
// Note: We use a separate type instead of extending Document to avoid
// conflicts with the native DOM ViewTransition types in newer TypeScript
interface ViewTransitionResult {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition: () => void;
}

// Type assertion helper for accessing startViewTransition
type StartViewTransitionFn = (callback: () => void | Promise<void>) => ViewTransitionResult;

// Type for document with startViewTransition
interface DocumentWithViewTransition {
  startViewTransition?: StartViewTransitionFn;
}

/**
 * Check if View Transitions API is supported
 */
export function supportsViewTransitions(): boolean {
  if (typeof document === 'undefined') return false;
  return 'startViewTransition' in document;
}

/**
 * Hook for navigating with View Transitions
 *
 * @example
 * ```tsx
 * const { navigateWithTransition } = useViewTransition();
 *
 * <button onClick={() => navigateWithTransition('/dashboard')}>
 *   Go to Dashboard
 * </button>
 * ```
 */
export function useViewTransition() {
  const router = useRouter();

  const navigateWithTransition = useCallback(
    async (href: string, options?: { replace?: boolean }) => {
      const doc = document as DocumentWithViewTransition;

      // Fallback for browsers without View Transitions API
      if (!doc.startViewTransition) {
        if (options?.replace) {
          router.replace(href);
        } else {
          router.push(href);
        }
        return;
      }

      // Use View Transitions API for smooth animation
      const transition = doc.startViewTransition(() => {
        if (options?.replace) {
          router.replace(href);
        } else {
          router.push(href);
        }
      });

      // Wait for the transition to complete
      await transition.finished;
    },
    [router]
  );

  return {
    navigateWithTransition,
    isSupported: supportsViewTransitions(),
  };
}

/**
 * Start a view transition for any DOM update
 *
 * @example
 * ```tsx
 * startViewTransition(() => {
 *   setShowDetails(true);
 * });
 * ```
 */
export function startViewTransition(
  callback: () => void | Promise<void>
): ViewTransitionResult | null {
  const doc = document as DocumentWithViewTransition;

  if (!doc.startViewTransition) {
    // Fallback: just run the callback
    void Promise.resolve(callback());
    return null;
  }

  return doc.startViewTransition(callback);
}
