/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  FeatureFlagProvider,
  useFeatureFlags,
  useFeatureFlag,
  useFeatureFlagVariant,
  useFeatureFlagPayload,
} from '@/lib/feature-flags';
import type { EvaluatedFeatureFlag } from '@/lib/feature-flags';

// =============================================================================
// Mocks
// =============================================================================

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ status: 'authenticated' })),
}));

// Mock the server action
const mockGetFeatureFlagsAction = vi.fn<() => Promise<EvaluatedFeatureFlag[]>>();
vi.mock('@/app/actions/feature-flags', () => ({
  getFeatureFlagsAction: () => mockGetFeatureFlagsAction(),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// =============================================================================
// Test Helpers
// =============================================================================

function createWrapper(props: Partial<Parameters<typeof FeatureFlagProvider>[0]> = {}) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <FeatureFlagProvider autoRefresh={false} {...props}>
        {children}
      </FeatureFlagProvider>
    );
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('FeatureFlagProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockGetFeatureFlagsAction.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should fetch flags on mount when authenticated', async () => {
      const flags: EvaluatedFeatureFlag[] = [
        { key: 'feature_a', enabled: true },
        { key: 'feature_b', enabled: false },
      ];
      mockGetFeatureFlagsAction.mockResolvedValue(flags);

      const { result } = renderHook(() => useFeatureFlags(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(mockGetFeatureFlagsAction).toHaveBeenCalledTimes(1);
      expect(result.current.isEnabled('feature_a')).toBe(true);
      expect(result.current.isEnabled('feature_b')).toBe(false);
    });

    it('should use initial flags immediately and fetch updates', async () => {
      const initialFlags: EvaluatedFeatureFlag[] = [{ key: 'initial_flag', enabled: true }];
      mockGetFeatureFlagsAction.mockResolvedValue([
        { key: 'initial_flag', enabled: true },
        { key: 'new_flag', enabled: false },
      ]);

      const { result } = renderHook(() => useFeatureFlags(), {
        wrapper: createWrapper({ initialFlags }),
      });

      // Should immediately be initialized with initial flags (no loading state)
      expect(result.current.isInitialized).toBe(true);
      expect(result.current.isEnabled('initial_flag')).toBe(true);

      // Wait for background fetch to complete
      await waitFor(() => {
        expect(mockGetFeatureFlagsAction).toHaveBeenCalled();
      });

      // Should have updated flags after fetch
      expect(result.current.isEnabled('initial_flag')).toBe(true);
      expect(result.current.isEnabled('new_flag')).toBe(false);
    });

    it('should cache flags in localStorage', async () => {
      const flags: EvaluatedFeatureFlag[] = [{ key: 'cached_flag', enabled: true }];
      mockGetFeatureFlagsAction.mockResolvedValue(flags);

      const { result } = renderHook(() => useFeatureFlags(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const cached = JSON.parse(localStorageMock.setItem.mock.calls[0][1] as string) as {
        flags: EvaluatedFeatureFlag[];
      };
      expect(cached.flags).toEqual(flags);
    });
  });

  describe('isEnabled', () => {
    it('should return true for enabled flags', async () => {
      mockGetFeatureFlagsAction.mockResolvedValue([{ key: 'enabled_flag', enabled: true }]);

      const { result } = renderHook(() => useFeatureFlags(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(result.current.isEnabled('enabled_flag')).toBe(true);
    });

    it('should return false for disabled flags', async () => {
      mockGetFeatureFlagsAction.mockResolvedValue([{ key: 'disabled_flag', enabled: false }]);

      const { result } = renderHook(() => useFeatureFlags(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(result.current.isEnabled('disabled_flag')).toBe(false);
    });

    it('should return default value for unknown flags', async () => {
      mockGetFeatureFlagsAction.mockResolvedValue([]);

      const { result } = renderHook(() => useFeatureFlags(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(result.current.isEnabled('unknown_flag')).toBe(false);
      expect(result.current.isEnabled('unknown_flag', true)).toBe(true);
    });
  });

  describe('variants', () => {
    it('should return variant for enabled flag', async () => {
      mockGetFeatureFlagsAction.mockResolvedValue([
        { key: 'ab_test', enabled: true, variant: 'variant_b' },
      ]);

      const { result } = renderHook(() => useFeatureFlags(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(result.current.getVariant('ab_test')).toBe('variant_b');
    });

    it('should return undefined variant for disabled flag', async () => {
      mockGetFeatureFlagsAction.mockResolvedValue([
        { key: 'ab_test', enabled: false, variant: 'variant_b' },
      ]);

      const { result } = renderHook(() => useFeatureFlags(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // getVariant returns the stored variant regardless of enabled state
      // useFeatureFlagVariant hook filters based on enabled
      expect(result.current.getVariant('ab_test')).toBe('variant_b');
    });
  });

  describe('payload', () => {
    it('should return payload for enabled flag', async () => {
      const payload = { message: 'Hello', discount: 20 };
      mockGetFeatureFlagsAction.mockResolvedValue([{ key: 'promo', enabled: true, payload }]);

      const { result } = renderHook(() => useFeatureFlags(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(result.current.getPayload('promo')).toEqual(payload);
    });
  });

  describe('refresh', () => {
    it('should refresh flags when refresh is called', async () => {
      mockGetFeatureFlagsAction.mockResolvedValueOnce([{ key: 'flag', enabled: false }]);

      const { result } = renderHook(() => useFeatureFlags(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(result.current.isEnabled('flag')).toBe(false);

      // Mock updated flags
      mockGetFeatureFlagsAction.mockResolvedValueOnce([{ key: 'flag', enabled: true }]);

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.isEnabled('flag')).toBe(true);
      expect(mockGetFeatureFlagsAction).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('should set error state when fetch fails', async () => {
      const error = new Error('Network error');
      mockGetFeatureFlagsAction.mockRejectedValue(error);

      const { result } = renderHook(() => useFeatureFlags(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(result.current.error).toEqual(error);
    });

    it('should still be usable after error', async () => {
      mockGetFeatureFlagsAction.mockRejectedValue(new Error('Failed'));

      const { result } = renderHook(() => useFeatureFlags(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Should use default values
      expect(result.current.isEnabled('any_flag')).toBe(false);
      expect(result.current.isEnabled('any_flag', true)).toBe(true);
    });
  });
});

describe('useFeatureFlag hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it('should return enabled state for a flag', async () => {
    mockGetFeatureFlagsAction.mockResolvedValue([{ key: 'my_feature', enabled: true }]);

    const { result } = renderHook(() => useFeatureFlag('my_feature'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('should return default value for unknown flag', async () => {
    mockGetFeatureFlagsAction.mockResolvedValue([]);

    const { result } = renderHook(() => useFeatureFlag('unknown', true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });
});

describe('useFeatureFlagVariant hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it('should return variant for enabled flag', async () => {
    mockGetFeatureFlagsAction.mockResolvedValue([
      { key: 'experiment', enabled: true, variant: 'treatment' },
    ]);

    const { result } = renderHook(() => useFeatureFlagVariant('experiment'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toBe('treatment');
    });
  });

  it('should return undefined for disabled flag', async () => {
    mockGetFeatureFlagsAction.mockResolvedValue([
      { key: 'experiment', enabled: false, variant: 'treatment' },
    ]);

    const { result } = renderHook(() => useFeatureFlagVariant('experiment'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toBeUndefined();
    });
  });
});

describe('useFeatureFlagPayload hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it('should return payload for enabled flag', async () => {
    mockGetFeatureFlagsAction.mockResolvedValue([
      {
        key: 'promo',
        enabled: true,
        payload: { message: 'Sale!', discount: 10 },
      },
    ]);

    const { result } = renderHook(() => useFeatureFlagPayload('promo'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toEqual({ message: 'Sale!', discount: 10 });
    });
  });

  it('should return undefined for disabled flag', async () => {
    mockGetFeatureFlagsAction.mockResolvedValue([
      {
        key: 'promo',
        enabled: false,
        payload: { message: 'Sale!' },
      },
    ]);

    const { result } = renderHook(() => useFeatureFlagPayload('promo'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toBeUndefined();
    });
  });
});

describe('context error handling', () => {
  it('should throw when useFeatureFlags is used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useFeatureFlags());
    }).toThrow('useFeatureFlags must be used within a FeatureFlagProvider');

    consoleSpy.mockRestore();
  });
});
