import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast, toast } from '../../hooks/use-toast';

// Helper to clear all toasts between tests
function clearAllToasts() {
  const { result } = renderHook(() => useToast());
  act(() => {
    result.current.toasts.forEach((t) => result.current.dismiss(t.id));
  });
}

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearAllToasts();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should initialize with empty toasts array', () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toasts).toEqual([]);
  });

  it('should add a toast', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({ title: 'Test Toast' });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe('Test Toast');
  });

  it('should add a toast with description', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({
        title: 'Test Toast',
        description: 'Test Description',
      });
    });

    expect(result.current.toasts[0].title).toBe('Test Toast');
    expect(result.current.toasts[0].description).toBe('Test Description');
  });

  it('should add a toast with variant', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({
        title: 'Success',
        variant: 'success',
      });
    });

    expect(result.current.toasts[0].variant).toBe('success');
  });

  it('should generate unique IDs for toasts', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({ title: 'Toast 1' });
      result.current.toast({ title: 'Toast 2' });
    });

    expect(result.current.toasts).toHaveLength(2);
    expect(result.current.toasts[0].id).not.toBe(result.current.toasts[1].id);
  });

  it('should dismiss a toast', () => {
    const { result } = renderHook(() => useToast());

    let toastId: string;

    act(() => {
      toastId = result.current.toast({ title: 'Test Toast' });
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      result.current.dismiss(toastId);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('should auto-dismiss toast after 5 seconds', async () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({ title: 'Test Toast' });
    });

    expect(result.current.toasts).toHaveLength(1);

    // Fast-forward time by 5 seconds
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('should not dismiss toast before 5 seconds', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({ title: 'Test Toast' });
    });

    expect(result.current.toasts).toHaveLength(1);

    // Fast-forward time by 3 seconds (less than 5)
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.toasts).toHaveLength(1);
  });

  it('should handle multiple toasts', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({ title: 'Toast 1' });
      result.current.toast({ title: 'Toast 2' });
      result.current.toast({ title: 'Toast 3' });
    });

    expect(result.current.toasts).toHaveLength(3);
  });

  it('should maintain order when adding multiple toasts', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({ title: 'First' });
      result.current.toast({ title: 'Second' });
      result.current.toast({ title: 'Third' });
    });

    expect(result.current.toasts[0].title).toBe('First');
    expect(result.current.toasts[1].title).toBe('Second');
    expect(result.current.toasts[2].title).toBe('Third');
  });

  it('should dismiss only the specified toast', () => {
    const { result } = renderHook(() => useToast());

    let toast1Id: string;
    let toast2Id: string;

    act(() => {
      toast1Id = result.current.toast({ title: 'Toast 1' });
      toast2Id = result.current.toast({ title: 'Toast 2' });
    });

    expect(result.current.toasts).toHaveLength(2);

    act(() => {
      result.current.dismiss(toast1Id);
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].id).toBe(toast2Id);
  });

  describe('Convenience methods', () => {
    it('should create success toast', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast.success('Success!', 'Operation completed');
      });

      expect(result.current.toasts[0].title).toBe('Success!');
      expect(result.current.toasts[0].description).toBe('Operation completed');
      expect(result.current.toasts[0].variant).toBe('success');
    });

    it('should create error toast', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast.error('Error!', 'Something went wrong');
      });

      expect(result.current.toasts[0].title).toBe('Error!');
      expect(result.current.toasts[0].description).toBe('Something went wrong');
      expect(result.current.toasts[0].variant).toBe('error');
    });

    it('should create warning toast', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast.warning('Warning!', 'Be careful');
      });

      expect(result.current.toasts[0].title).toBe('Warning!');
      expect(result.current.toasts[0].description).toBe('Be careful');
      expect(result.current.toasts[0].variant).toBe('warning');
    });

    it('should create default toast', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast.default('Info', 'Some information');
      });

      expect(result.current.toasts[0].title).toBe('Info');
      expect(result.current.toasts[0].description).toBe('Some information');
      expect(result.current.toasts[0].variant).toBe('default');
    });

    it('should work without description', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast.success('Success!');
      });

      expect(result.current.toasts[0].title).toBe('Success!');
      expect(result.current.toasts[0].description).toBeUndefined();
    });

    it('should auto-dismiss convenience method toasts', async () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast.success('Success!');
      });

      expect(result.current.toasts).toHaveLength(1);

      await act(async () => {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
      });

      expect(result.current.toasts).toHaveLength(0);
    });
  });

  describe('State sharing', () => {
    it('should share state across multiple hook instances', () => {
      const { result: result1 } = renderHook(() => useToast());
      const { result: result2 } = renderHook(() => useToast());

      act(() => {
        result1.current.toast({ title: 'Shared Toast' });
      });

      expect(result1.current.toasts).toHaveLength(1);
      expect(result2.current.toasts).toHaveLength(1);
      expect(result1.current.toasts[0].id).toBe(result2.current.toasts[0].id);
    });

    it('should update all hook instances when toast is dismissed', () => {
      const { result: result1 } = renderHook(() => useToast());
      const { result: result2 } = renderHook(() => useToast());

      let toastId: string;

      act(() => {
        toastId = result1.current.toast({ title: 'Shared Toast' });
      });

      expect(result1.current.toasts).toHaveLength(1);
      expect(result2.current.toasts).toHaveLength(1);

      act(() => {
        result2.current.dismiss(toastId);
      });

      expect(result1.current.toasts).toHaveLength(0);
      expect(result2.current.toasts).toHaveLength(0);
    });
  });
});
