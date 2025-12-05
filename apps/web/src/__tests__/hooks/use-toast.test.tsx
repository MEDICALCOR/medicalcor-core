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

  describe('Toast update pattern (dismiss + recreate)', () => {
    // NOTE: The current toast implementation does not support direct updates.
    // The pattern for "updating" a toast is to dismiss the old one and create a new one.

    it('should allow updating a toast by dismiss and recreate', () => {
      const { result } = renderHook(() => useToast());

      let originalId: string;

      act(() => {
        originalId = result.current.toast({ title: 'Loading...', variant: 'default' });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe('Loading...');

      // "Update" by dismissing and creating new toast
      let updatedId: string;
      act(() => {
        result.current.dismiss(originalId);
        updatedId = result.current.toast({ title: 'Success!', variant: 'success' });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe('Success!');
      expect(result.current.toasts[0].variant).toBe('success');
      expect(updatedId).not.toBe(originalId);
    });

    it('should preserve other toasts when updating one via dismiss/recreate', () => {
      const { result } = renderHook(() => useToast());

      let toastToUpdate: string;

      act(() => {
        result.current.toast({ title: 'First Toast' });
        toastToUpdate = result.current.toast({ title: 'Updating...' });
        result.current.toast({ title: 'Third Toast' });
      });

      expect(result.current.toasts).toHaveLength(3);

      // "Update" the middle toast
      act(() => {
        result.current.dismiss(toastToUpdate);
        result.current.toast({ title: 'Updated!' });
      });

      expect(result.current.toasts).toHaveLength(3);
      const titles = result.current.toasts.map((t) => t.title);
      expect(titles).toContain('First Toast');
      expect(titles).toContain('Third Toast');
      expect(titles).toContain('Updated!');
      expect(titles).not.toContain('Updating...');
    });

    it('should support changing variant during update pattern', () => {
      const { result } = renderHook(() => useToast());

      let toastId: string;

      // Start with a loading state
      act(() => {
        toastId = result.current.toast({ title: 'Saving...', variant: 'default' });
      });

      expect(result.current.toasts[0].variant).toBe('default');

      // Simulate error state
      act(() => {
        result.current.dismiss(toastId);
        toastId = result.current.toast({ title: 'Failed to save', variant: 'error' });
      });

      expect(result.current.toasts[0].variant).toBe('error');
      expect(result.current.toasts[0].title).toBe('Failed to save');

      // Simulate retry success
      act(() => {
        result.current.dismiss(toastId);
        result.current.toast({ title: 'Saved successfully!', variant: 'success' });
      });

      expect(result.current.toasts[0].variant).toBe('success');
    });
  });

  describe('Edge cases and robustness', () => {
    it('should handle dismissing non-existent toast gracefully', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Real Toast' });
      });

      expect(result.current.toasts).toHaveLength(1);

      // Dismiss a non-existent toast
      act(() => {
        result.current.dismiss('non-existent-id');
      });

      // Original toast should remain
      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe('Real Toast');
    });

    it('should handle dismissing same toast multiple times', () => {
      const { result } = renderHook(() => useToast());

      let toastId: string;

      act(() => {
        toastId = result.current.toast({ title: 'Test Toast' });
      });

      expect(result.current.toasts).toHaveLength(1);

      // Dismiss multiple times
      act(() => {
        result.current.dismiss(toastId);
        result.current.dismiss(toastId);
        result.current.dismiss(toastId);
      });

      expect(result.current.toasts).toHaveLength(0);
    });

    it('should handle rapid toast creation and dismissal', () => {
      const { result } = renderHook(() => useToast());

      const toastIds: string[] = [];

      // Rapidly create 10 toasts
      act(() => {
        for (let i = 0; i < 10; i++) {
          toastIds.push(result.current.toast({ title: `Toast ${i}` }));
        }
      });

      expect(result.current.toasts).toHaveLength(10);

      // Rapidly dismiss all odd-indexed toasts
      act(() => {
        toastIds.forEach((id, index) => {
          if (index % 2 === 1) {
            result.current.dismiss(id);
          }
        });
      });

      expect(result.current.toasts).toHaveLength(5);
      result.current.toasts.forEach((t) => {
        const index = parseInt(t.title.replace('Toast ', ''));
        expect(index % 2).toBe(0);
      });
    });

    it('should support all variant types', () => {
      const { result } = renderHook(() => useToast());

      const variants = ['default', 'success', 'error', 'warning', 'destructive'] as const;

      act(() => {
        variants.forEach((variant) => {
          result.current.toast({ title: `${variant} toast`, variant });
        });
      });

      expect(result.current.toasts).toHaveLength(5);

      variants.forEach((variant, index) => {
        expect(result.current.toasts[index].variant).toBe(variant);
      });
    });

    it('should handle empty title', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: '' });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe('');
    });

    it('should handle very long content', () => {
      const { result } = renderHook(() => useToast());

      const longTitle = 'A'.repeat(1000);
      const longDescription = 'B'.repeat(5000);

      act(() => {
        result.current.toast({ title: longTitle, description: longDescription });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe(longTitle);
      expect(result.current.toasts[0].description).toBe(longDescription);
    });

    it('should handle special characters in content', () => {
      const { result } = renderHook(() => useToast());

      const specialTitle = '<script>alert("xss")</script>';
      const specialDescription = '{"key": "value"} & <html>';

      act(() => {
        result.current.toast({ title: specialTitle, description: specialDescription });
      });

      expect(result.current.toasts[0].title).toBe(specialTitle);
      expect(result.current.toasts[0].description).toBe(specialDescription);
    });
  });

  describe('Auto-dismiss timing', () => {
    it('should stagger auto-dismiss for multiple toasts', async () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Toast 1' });
      });

      // Wait 2 seconds, then add another toast
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      act(() => {
        result.current.toast({ title: 'Toast 2' });
      });

      expect(result.current.toasts).toHaveLength(2);

      // After 3 more seconds (5 total from first), first toast should dismiss
      await act(async () => {
        vi.advanceTimersByTime(3000);
        await Promise.resolve();
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe('Toast 2');

      // After 2 more seconds (5 total from second), second toast should dismiss
      await act(async () => {
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(result.current.toasts).toHaveLength(0);
    });

    it('should not auto-dismiss manually dismissed toast', async () => {
      const { result } = renderHook(() => useToast());

      let toastId: string;

      act(() => {
        toastId = result.current.toast({ title: 'Test Toast' });
      });

      expect(result.current.toasts).toHaveLength(1);

      // Dismiss manually after 1 second
      act(() => {
        vi.advanceTimersByTime(1000);
        result.current.dismiss(toastId);
      });

      expect(result.current.toasts).toHaveLength(0);

      // Wait for auto-dismiss timer to fire (should have no effect)
      await act(async () => {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
      });

      // Should still be empty (no errors, no side effects)
      expect(result.current.toasts).toHaveLength(0);
    });
  });
});
