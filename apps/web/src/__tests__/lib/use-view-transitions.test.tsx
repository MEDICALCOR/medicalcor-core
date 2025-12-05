import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useViewTransition,
  supportsViewTransitions,
  startViewTransition,
} from '../../lib/hooks/use-view-transitions';

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

describe('useViewTransition', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
  });

  describe('supportsViewTransitions', () => {
    it('should return false in non-browser environment', () => {
      const originalDocument = global.document;
      // @ts-expect-error - Testing undefined document
      global.document = undefined;

      expect(supportsViewTransitions()).toBe(false);

      global.document = originalDocument;
    });

    it('should return true when startViewTransition is available', () => {
      Object.defineProperty(document, 'startViewTransition', {
        value: vi.fn(),
        configurable: true,
      });

      expect(supportsViewTransitions()).toBe(true);

      // Clean up
      // @ts-expect-error - Deleting test property
      delete document.startViewTransition;
    });

    it('should return false when startViewTransition is not available', () => {
      // @ts-expect-error - Deleting test property
      delete document.startViewTransition;

      expect(supportsViewTransitions()).toBe(false);
    });
  });

  describe('useViewTransition hook', () => {
    it('should return navigateWithTransition function and isSupported flag', () => {
      const { result } = renderHook(() => useViewTransition());

      expect(result.current.navigateWithTransition).toBeInstanceOf(Function);
      expect(typeof result.current.isSupported).toBe('boolean');
    });

    it('should navigate using router.push when View Transitions not supported', async () => {
      // @ts-expect-error - Deleting test property
      delete document.startViewTransition;

      const { result } = renderHook(() => useViewTransition());

      await act(async () => {
        await result.current.navigateWithTransition('/dashboard');
      });

      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });

    it('should navigate using router.replace when replace option is true', async () => {
      // @ts-expect-error - Deleting test property
      delete document.startViewTransition;

      const { result } = renderHook(() => useViewTransition());

      await act(async () => {
        await result.current.navigateWithTransition('/dashboard', { replace: true });
      });

      expect(mockReplace).toHaveBeenCalledWith('/dashboard');
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should use View Transitions API when supported', async () => {
      const mockTransition = {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: vi.fn(),
      };

      const startViewTransitionMock = vi.fn((callback) => {
        // Execute callback immediately to trigger router.push
        callback();
        return mockTransition;
      });

      Object.defineProperty(document, 'startViewTransition', {
        value: startViewTransitionMock,
        configurable: true,
      });

      const { result } = renderHook(() => useViewTransition());

      await act(async () => {
        await result.current.navigateWithTransition('/dashboard');
      });

      expect(startViewTransitionMock).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/dashboard');

      // Clean up
      // @ts-expect-error - Deleting test property
      delete document.startViewTransition;
    });

    it('should wait for transition to finish', async () => {
      let resolveTransition: () => void;
      const transitionPromise = new Promise<void>((resolve) => {
        resolveTransition = resolve;
      });

      const mockTransition = {
        finished: transitionPromise,
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: vi.fn(),
      };

      const startViewTransitionMock = vi.fn(() => mockTransition);

      Object.defineProperty(document, 'startViewTransition', {
        value: startViewTransitionMock,
        configurable: true,
      });

      const { result } = renderHook(() => useViewTransition());

      let navigationCompleted = false;

      act(() => {
        result.current.navigateWithTransition('/dashboard').then(() => {
          navigationCompleted = true;
        });
      });

      // Should not be completed yet
      expect(navigationCompleted).toBe(false);

      // Resolve the transition
      await act(async () => {
        resolveTransition!();
        await transitionPromise;
      });

      // Should be completed now
      expect(navigationCompleted).toBe(true);

      // Clean up
      // @ts-expect-error - Deleting test property
      delete document.startViewTransition;
    });

    it('should call router.replace inside transition when replace is true', async () => {
      const mockTransition = {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: vi.fn(),
      };

      const startViewTransitionMock = vi.fn((callback) => {
        callback();
        return mockTransition;
      });

      Object.defineProperty(document, 'startViewTransition', {
        value: startViewTransitionMock,
        configurable: true,
      });

      const { result } = renderHook(() => useViewTransition());

      await act(async () => {
        await result.current.navigateWithTransition('/settings', { replace: true });
      });

      expect(mockReplace).toHaveBeenCalledWith('/settings');
      expect(mockPush).not.toHaveBeenCalled();

      // Clean up
      // @ts-expect-error - Deleting test property
      delete document.startViewTransition;
    });
  });

  describe('startViewTransition function', () => {
    it('should call callback when View Transitions not supported', () => {
      // @ts-expect-error - Deleting test property
      delete document.startViewTransition;

      const callback = vi.fn();
      const result = startViewTransition(callback);

      expect(result).toBeNull();
      expect(callback).toHaveBeenCalled();
    });

    it('should use View Transitions API when supported', () => {
      const mockTransition = {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: vi.fn(),
      };

      const startViewTransitionMock = vi.fn(() => mockTransition);

      Object.defineProperty(document, 'startViewTransition', {
        value: startViewTransitionMock,
        configurable: true,
      });

      const callback = vi.fn();
      const result = startViewTransition(callback);

      expect(startViewTransitionMock).toHaveBeenCalledWith(callback);
      expect(result).toBe(mockTransition);

      // Clean up
      // @ts-expect-error - Deleting test property
      delete document.startViewTransition;
    });

    it('should handle async callbacks', async () => {
      const mockTransition = {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: vi.fn(),
      };

      const startViewTransitionMock = vi.fn(() => mockTransition);

      Object.defineProperty(document, 'startViewTransition', {
        value: startViewTransitionMock,
        configurable: true,
      });

      const asyncCallback = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      startViewTransition(asyncCallback);

      expect(startViewTransitionMock).toHaveBeenCalledWith(asyncCallback);

      // Clean up
      // @ts-expect-error - Deleting test property
      delete document.startViewTransition;
    });
  });
});
