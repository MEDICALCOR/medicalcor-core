/**
 * useToast - Platinum Standard Tests
 *
 * Pattern: AAA (Arrange–Act–Assert)
 * Coverage: happy path + error path + edge cases + state sharing
 * Cleanup: timers, mocks, global toast state - all properly isolated
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useToast, toast } from '../../hooks/use-toast';

/**
 * Helper to clear all toasts between tests
 */
function clearAllToasts() {
  const { result } = renderHook(() => useToast());
  act(() => {
    result.current.toasts.forEach((t) => {
      result.current.dismiss(t.id);
    });
  });
}

describe('useToast (platinum standard)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearAllToasts();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
    clearAllToasts();
  });

  describe('Basic functionality', () => {
    it('initializes with empty toasts array', () => {
      // ARRANGE & ACT
      const { result } = renderHook(() => useToast());

      // ASSERT
      expect(result.current.toasts).toEqual([]);
    });

    it('adds a toast with title', () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());

      // ACT
      act(() => {
        result.current.toast({ title: 'Test Toast' });
      });

      // ASSERT
      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe('Test Toast');
    });

    it('adds a toast with title and description', () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());

      // ACT
      act(() => {
        result.current.toast({
          title: 'Test Toast',
          description: 'Test Description',
        });
      });

      // ASSERT
      expect(result.current.toasts[0].title).toBe('Test Toast');
      expect(result.current.toasts[0].description).toBe('Test Description');
    });

    it('adds a toast with variant', () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());

      // ACT
      act(() => {
        result.current.toast({
          title: 'Success',
          variant: 'success',
        });
      });

      // ASSERT
      expect(result.current.toasts[0].variant).toBe('success');
    });

    it('generates unique IDs for multiple toasts', () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());

      // ACT
      act(() => {
        result.current.toast({ title: 'Toast 1' });
        result.current.toast({ title: 'Toast 2' });
      });

      // ASSERT
      expect(result.current.toasts).toHaveLength(2);
      expect(result.current.toasts[0].id).not.toBe(result.current.toasts[1].id);
    });

    it('returns toast ID when creating a toast', () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());
      let toastId: string;

      // ACT
      act(() => {
        toastId = result.current.toast({ title: 'Test Toast' });
      });

      // ASSERT
      expect(toastId!).toBeDefined();
      expect(result.current.toasts[0].id).toBe(toastId!);
    });
  });

  describe('Dismissing toasts', () => {
    it('dismisses a specific toast by ID', () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());
      let toastId: string;

      act(() => {
        toastId = result.current.toast({ title: 'Test Toast' });
      });

      expect(result.current.toasts).toHaveLength(1);

      // ACT
      act(() => {
        result.current.dismiss(toastId);
      });

      // ASSERT
      expect(result.current.toasts).toHaveLength(0);
    });

    it('dismisses only the specified toast when multiple exist', () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());
      let toast1Id = '';
      let toast2Id = '';

      act(() => {
        toast1Id = result.current.toast({ title: 'Toast 1' });
        toast2Id = result.current.toast({ title: 'Toast 2' });
      });

      expect(result.current.toasts).toHaveLength(2);

      // ACT
      act(() => {
        result.current.dismiss(toast1Id);
      });

      // ASSERT
      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].id).toBe(toast2Id);
    });

    it('handles dismissing non-existent toast gracefully', () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Test Toast' });
      });

      // ACT & ASSERT - should not throw
      act(() => {
        result.current.dismiss('non-existent-id');
      });

      expect(result.current.toasts).toHaveLength(1);
    });
  });

  describe('Auto-dismiss behavior', () => {
    it('auto-dismisses toast after 5 seconds', async () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Test Toast' });
      });

      expect(result.current.toasts).toHaveLength(1);

      // ACT - advance time by 5 seconds
      await act(async () => {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
      });

      // ASSERT
      expect(result.current.toasts).toHaveLength(0);
    });

    it('does not dismiss toast before 5 seconds', () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Test Toast' });
      });

      expect(result.current.toasts).toHaveLength(1);

      // ACT - advance time by 3 seconds (less than 5)
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // ASSERT
      expect(result.current.toasts).toHaveLength(1);
    });

    it('auto-dismisses multiple toasts independently', async () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Toast 1' });
      });

      // Add second toast after 2 seconds
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      act(() => {
        result.current.toast({ title: 'Toast 2' });
      });

      expect(result.current.toasts).toHaveLength(2);

      // ACT - advance 3 more seconds (5 total for first toast)
      await act(async () => {
        vi.advanceTimersByTime(3000);
        await Promise.resolve();
      });

      // ASSERT - first toast dismissed, second still present
      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe('Toast 2');

      // Advance 2 more seconds (5 total for second toast)
      await act(async () => {
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(result.current.toasts).toHaveLength(0);
    });
  });

  describe('Multiple toasts', () => {
    it('handles multiple toasts correctly', () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());

      // ACT
      act(() => {
        result.current.toast({ title: 'Toast 1' });
        result.current.toast({ title: 'Toast 2' });
        result.current.toast({ title: 'Toast 3' });
      });

      // ASSERT
      expect(result.current.toasts).toHaveLength(3);
    });

    it('maintains order when adding multiple toasts', () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());

      // ACT
      act(() => {
        result.current.toast({ title: 'First' });
        result.current.toast({ title: 'Second' });
        result.current.toast({ title: 'Third' });
      });

      // ASSERT
      expect(result.current.toasts[0].title).toBe('First');
      expect(result.current.toasts[1].title).toBe('Second');
      expect(result.current.toasts[2].title).toBe('Third');
    });
  });

  describe('Convenience methods', () => {
    it('creates success toast with correct variant', () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());

      // ACT
      act(() => {
        toast.success('Success!', 'Operation completed');
      });

      // ASSERT
      expect(result.current.toasts[0].title).toBe('Success!');
      expect(result.current.toasts[0].description).toBe('Operation completed');
      expect(result.current.toasts[0].variant).toBe('success');
    });

    it('creates error toast with correct variant', () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());

      // ACT
      act(() => {
        toast.error('Error!', 'Something went wrong');
      });

      // ASSERT
      expect(result.current.toasts[0].title).toBe('Error!');
      expect(result.current.toasts[0].description).toBe('Something went wrong');
      expect(result.current.toasts[0].variant).toBe('error');
    });

    it('creates warning toast with correct variant', () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());

      // ACT
      act(() => {
        toast.warning('Warning!', 'Be careful');
      });

      // ASSERT
      expect(result.current.toasts[0].title).toBe('Warning!');
      expect(result.current.toasts[0].description).toBe('Be careful');
      expect(result.current.toasts[0].variant).toBe('warning');
    });

    it('creates default toast with correct variant', () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());

      // ACT
      act(() => {
        toast.default('Info', 'Some information');
      });

      // ASSERT
      expect(result.current.toasts[0].title).toBe('Info');
      expect(result.current.toasts[0].description).toBe('Some information');
      expect(result.current.toasts[0].variant).toBe('default');
    });

    it('works without description', () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());

      // ACT
      act(() => {
        toast.success('Success!');
      });

      // ASSERT
      expect(result.current.toasts[0].title).toBe('Success!');
      expect(result.current.toasts[0].description).toBeUndefined();
    });

    it('auto-dismisses convenience method toasts', async () => {
      // ARRANGE
      const { result } = renderHook(() => useToast());

      act(() => {
        toast.success('Success!');
      });

      expect(result.current.toasts).toHaveLength(1);

      // ACT
      await act(async () => {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
      });

      // ASSERT
      expect(result.current.toasts).toHaveLength(0);
    });
  });

  describe('State sharing across hook instances', () => {
    it('shares state across multiple hook instances', () => {
      // ARRANGE
      const { result: result1 } = renderHook(() => useToast());
      const { result: result2 } = renderHook(() => useToast());

      // ACT
      act(() => {
        result1.current.toast({ title: 'Shared Toast' });
      });

      // ASSERT
      expect(result1.current.toasts).toHaveLength(1);
      expect(result2.current.toasts).toHaveLength(1);
      expect(result1.current.toasts[0].id).toBe(result2.current.toasts[0].id);
    });

    it('updates all hook instances when toast is dismissed', () => {
      // ARRANGE
      const { result: result1 } = renderHook(() => useToast());
      const { result: result2 } = renderHook(() => useToast());

      let toastId: string;

      act(() => {
        toastId = result1.current.toast({ title: 'Shared Toast' });
      });

      expect(result1.current.toasts).toHaveLength(1);
      expect(result2.current.toasts).toHaveLength(1);

      // ACT - dismiss from second instance
      act(() => {
        result2.current.dismiss(toastId);
      });

      // ASSERT - both instances reflect the change
      expect(result1.current.toasts).toHaveLength(0);
      expect(result2.current.toasts).toHaveLength(0);
    });

    it('reflects toasts created from any instance', () => {
      // ARRANGE
      const { result: result1 } = renderHook(() => useToast());
      const { result: result2 } = renderHook(() => useToast());

      // ACT
      act(() => {
        result1.current.toast({ title: 'From Instance 1' });
        result2.current.toast({ title: 'From Instance 2' });
      });

      // ASSERT
      expect(result1.current.toasts).toHaveLength(2);
      expect(result2.current.toasts).toHaveLength(2);
    });
  });
});
