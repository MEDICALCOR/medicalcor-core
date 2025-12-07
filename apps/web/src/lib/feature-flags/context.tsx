'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import { getFeatureFlagsAction } from '@/app/actions/feature-flags';
import type { EvaluatedFeatureFlag, FeatureFlagContextValue, FeatureFlagMap } from './types';

/**
 * Feature Flags Context Provider
 *
 * Provides feature flag state to the application with:
 * - Automatic loading on authentication
 * - Caching with configurable refresh interval
 * - Type-safe flag access via hooks
 * - Support for A/B testing variants
 *
 * @module lib/feature-flags/context
 */

// =============================================================================
// Constants
// =============================================================================

/** Default refresh interval for feature flags (5 minutes) */
const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/** Local storage key for caching flags */
const CACHE_KEY = 'medicalcor-feature-flags';

/** Cache TTL in milliseconds (1 minute) */
const CACHE_TTL_MS = 60 * 1000;

// =============================================================================
// Context
// =============================================================================

const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

// =============================================================================
// Provider Props
// =============================================================================

interface FeatureFlagProviderProps {
  children: ReactNode;
  /** Refresh interval in milliseconds (default: 5 minutes) */
  refreshInterval?: number;
  /** Whether to automatically refresh flags periodically */
  autoRefresh?: boolean;
  /** Initial flags (for SSR) */
  initialFlags?: EvaluatedFeatureFlag[];
}

// =============================================================================
// Cache Helpers
// =============================================================================

interface CachedFlags {
  flags: EvaluatedFeatureFlag[];
  timestamp: number;
}

function getCachedFlags(): EvaluatedFeatureFlag[] | null {
  if (typeof window === 'undefined') return null;

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const { flags, timestamp } = JSON.parse(cached) as CachedFlags;
    const age = Date.now() - timestamp;

    // Return cached flags if within TTL
    if (age < CACHE_TTL_MS) {
      return flags;
    }

    return null;
  } catch {
    return null;
  }
}

function setCachedFlags(flags: EvaluatedFeatureFlag[]): void {
  if (typeof window === 'undefined') return;

  try {
    const cached: CachedFlags = {
      flags,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Ignore storage errors
  }
}

function clearCachedFlags(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Ignore storage errors
  }
}

// =============================================================================
// Provider Component
// =============================================================================

/**
 * Feature Flag Provider
 *
 * Wraps the application to provide feature flag context.
 * Automatically fetches flags when user is authenticated.
 *
 * @example
 * ```tsx
 * // In providers.tsx
 * <FeatureFlagProvider>
 *   {children}
 * </FeatureFlagProvider>
 *
 * // In components
 * function MyComponent() {
 *   const { isEnabled } = useFeatureFlags();
 *
 *   if (isEnabled('new_dashboard')) {
 *     return <NewDashboard />;
 *   }
 *   return <OldDashboard />;
 * }
 * ```
 */
export function FeatureFlagProvider({
  children,
  refreshInterval = DEFAULT_REFRESH_INTERVAL_MS,
  autoRefresh = true,
  initialFlags,
}: FeatureFlagProviderProps) {
  const { status: sessionStatus } = useSession();

  // State
  const [flags, setFlags] = useState<FeatureFlagMap>(() => {
    // Initialize from initial flags or cache
    const initial = initialFlags ?? getCachedFlags() ?? [];
    return new Map(initial.map((f) => [f.key, f]));
  });
  const [isLoading, setIsLoading] = useState(!initialFlags);
  const [isInitialized, setIsInitialized] = useState(!!initialFlags);
  const [error, setError] = useState<Error | null>(null);

  // Refs
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);

  // Fetch flags from server
  const fetchFlags = useCallback(async () => {
    // Cancel any in-flight request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      setIsLoading(true);
      setError(null);

      const evaluatedFlags = await getFeatureFlagsAction();

      // Update state
      setFlags(new Map(evaluatedFlags.map((f) => [f.key, f])));
      setCachedFlags(evaluatedFlags);
      setIsInitialized(true);
      hasFetchedRef.current = true;
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      setError(err instanceof Error ? err : new Error('Failed to fetch feature flags'));

      // Still mark as initialized even on error (use cached/default values)
      setIsInitialized(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch flags when user authenticates
  useEffect(() => {
    if (sessionStatus === 'authenticated' && !hasFetchedRef.current) {
      void fetchFlags();
    } else if (sessionStatus === 'unauthenticated') {
      // Clear flags and cache on logout
      setFlags(new Map());
      clearCachedFlags();
      hasFetchedRef.current = false;
      setIsInitialized(true);
    }
  }, [sessionStatus, fetchFlags]);

  // Set up auto-refresh
  useEffect(() => {
    if (!autoRefresh || sessionStatus !== 'authenticated') {
      return;
    }

    refreshIntervalRef.current = setInterval(() => {
      void fetchFlags();
    }, refreshInterval);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [autoRefresh, refreshInterval, sessionStatus, fetchFlags]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  // Helper functions
  const isEnabled = useCallback(
    (key: string, defaultValue = false): boolean => {
      const flag = flags.get(key);
      return flag?.enabled ?? defaultValue;
    },
    [flags]
  );

  const getVariant = useCallback(
    (key: string): string | undefined => {
      return flags.get(key)?.variant;
    },
    [flags]
  );

  const getPayload = useCallback(
    (key: string): Record<string, unknown> | undefined => {
      return flags.get(key)?.payload;
    },
    [flags]
  );

  // Context value
  const value = useMemo<FeatureFlagContextValue>(
    () => ({
      flags,
      isEnabled,
      getVariant,
      getPayload,
      isLoading,
      isInitialized,
      error,
      refresh: fetchFlags,
    }),
    [flags, isEnabled, getVariant, getPayload, isLoading, isInitialized, error, fetchFlags]
  );

  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to access feature flag context
 *
 * @throws Error if used outside FeatureFlagProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isEnabled, getVariant, isLoading } = useFeatureFlags();
 *
 *   if (isLoading) return <Spinner />;
 *
 *   return isEnabled('feature_x') ? <FeatureX /> : <Legacy />;
 * }
 * ```
 */
export function useFeatureFlags(): FeatureFlagContextValue {
  const context = useContext(FeatureFlagContext);

  if (!context) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagProvider');
  }

  return context;
}

/**
 * Hook to check if a specific feature flag is enabled
 *
 * @param key - Feature flag key
 * @param defaultValue - Default value if flag is not found (default: false)
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const isNewDashboard = useFeatureFlag('new_dashboard');
 *
 *   return isNewDashboard ? <NewDashboard /> : <OldDashboard />;
 * }
 * ```
 */
export function useFeatureFlag(key: string, defaultValue = false): boolean {
  const { isEnabled } = useFeatureFlags();
  return isEnabled(key, defaultValue);
}

/**
 * Hook to get a feature flag's variant
 *
 * @param key - Feature flag key
 *
 * @example
 * ```tsx
 * function PricingPage() {
 *   const variant = useFeatureFlagVariant('pricing_experiment');
 *
 *   switch (variant) {
 *     case 'control': return <StandardPricing />;
 *     case 'variant_a': return <DiscountedPricing />;
 *     case 'variant_b': return <TieredPricing />;
 *     default: return <StandardPricing />;
 *   }
 * }
 * ```
 */
export function useFeatureFlagVariant(key: string): string | undefined {
  const { getVariant, isEnabled } = useFeatureFlags();

  // Only return variant if flag is enabled
  if (!isEnabled(key)) {
    return undefined;
  }

  return getVariant(key);
}

/**
 * Hook to get a feature flag's payload
 *
 * @param key - Feature flag key
 *
 * @example
 * ```tsx
 * function Banner() {
 *   const payload = useFeatureFlagPayload<{ message: string }>('promo_banner');
 *
 *   if (!payload) return null;
 *   return <div className="banner">{payload.message}</div>;
 * }
 * ```
 */
export function useFeatureFlagPayload(key: string): Record<string, unknown> | undefined {
  const { getPayload, isEnabled } = useFeatureFlags();

  // Only return payload if flag is enabled
  if (!isEnabled(key)) {
    return undefined;
  }

  return getPayload(key);
}
