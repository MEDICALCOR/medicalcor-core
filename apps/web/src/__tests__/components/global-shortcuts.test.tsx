import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { GlobalShortcuts } from '@/components/keyboard/global-shortcuts';

const mockPush = vi.fn();
const mockRegisterShortcut = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
  })),
}));

vi.mock('@/lib/keyboard', () => ({
  useKeyboard: vi.fn(() => ({
    registerShortcut: mockRegisterShortcut,
  })),
}));

describe('GlobalShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render any visible content', () => {
    const { container } = render(<GlobalShortcuts />);
    expect(container.firstChild).toBeNull();
  });

  it('should navigate to dashboard on g+d', async () => {
    render(<GlobalShortcuts />);

    // Simulate 'g' key
    const gEvent = new KeyboardEvent('keydown', { key: 'g' });
    document.dispatchEvent(gEvent);

    // Simulate 'd' key within timeout
    const dEvent = new KeyboardEvent('keydown', { key: 'd' });
    document.dispatchEvent(dEvent);

    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('should navigate to triage on g+t', async () => {
    render(<GlobalShortcuts />);

    const gEvent = new KeyboardEvent('keydown', { key: 'g' });
    document.dispatchEvent(gEvent);

    const tEvent = new KeyboardEvent('keydown', { key: 't' });
    document.dispatchEvent(tEvent);

    expect(mockPush).toHaveBeenCalledWith('/triage');
  });

  it('should navigate to calendar on g+c', async () => {
    render(<GlobalShortcuts />);

    const gEvent = new KeyboardEvent('keydown', { key: 'g' });
    document.dispatchEvent(gEvent);

    const cEvent = new KeyboardEvent('keydown', { key: 'c' });
    document.dispatchEvent(cEvent);

    expect(mockPush).toHaveBeenCalledWith('/calendar');
  });

  it('should navigate to settings on g+s', async () => {
    render(<GlobalShortcuts />);

    const gEvent = new KeyboardEvent('keydown', { key: 'g' });
    document.dispatchEvent(gEvent);

    const sEvent = new KeyboardEvent('keydown', { key: 's' });
    document.dispatchEvent(sEvent);

    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('should navigate to patients on g+p', async () => {
    render(<GlobalShortcuts />);

    const gEvent = new KeyboardEvent('keydown', { key: 'g' });
    document.dispatchEvent(gEvent);

    const pEvent = new KeyboardEvent('keydown', { key: 'p' });
    document.dispatchEvent(pEvent);

    expect(mockPush).toHaveBeenCalledWith('/patients');
  });

  it('should navigate to messages on g+m', async () => {
    render(<GlobalShortcuts />);

    const gEvent = new KeyboardEvent('keydown', { key: 'g' });
    document.dispatchEvent(gEvent);

    const mEvent = new KeyboardEvent('keydown', { key: 'm' });
    document.dispatchEvent(mEvent);

    expect(mockPush).toHaveBeenCalledWith('/messages');
  });

  it('should dispatch refresh event on r key', () => {
    render(<GlobalShortcuts />);

    const listener = vi.fn();
    window.addEventListener('app:refresh', listener);

    const rEvent = new KeyboardEvent('keydown', { key: 'r' });
    document.dispatchEvent(rEvent);

    expect(listener).toHaveBeenCalled();
  });

  it('should dispatch new-lead event on n key', () => {
    render(<GlobalShortcuts />);

    const listener = vi.fn();
    window.addEventListener('app:new-lead', listener);

    const nEvent = new KeyboardEvent('keydown', { key: 'n' });
    document.dispatchEvent(nEvent);

    expect(listener).toHaveBeenCalled();
  });

  it('should dispatch quick-search event on Ctrl+K', () => {
    render(<GlobalShortcuts />);

    const listener = vi.fn();
    window.addEventListener('app:quick-search', listener);

    const kEvent = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    document.dispatchEvent(kEvent);

    expect(listener).toHaveBeenCalled();
  });

  it('should dispatch quick-search event on Meta+K (Mac)', () => {
    render(<GlobalShortcuts />);

    const listener = vi.fn();
    window.addEventListener('app:quick-search', listener);

    const kEvent = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    document.dispatchEvent(kEvent);

    expect(listener).toHaveBeenCalled();
  });

  it('should not trigger shortcuts when typing in input', () => {
    render(<GlobalShortcuts />);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const rEvent = new KeyboardEvent('keydown', { key: 'r', bubbles: true });
    Object.defineProperty(rEvent, 'target', { value: input, enumerable: true });
    input.dispatchEvent(rEvent);

    const listener = vi.fn();
    window.addEventListener('app:refresh', listener);

    expect(listener).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('should not trigger shortcuts when typing in textarea', () => {
    render(<GlobalShortcuts />);

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    const nEvent = new KeyboardEvent('keydown', { key: 'n', bubbles: true });
    Object.defineProperty(nEvent, 'target', { value: textarea, enumerable: true });
    textarea.dispatchEvent(nEvent);

    const listener = vi.fn();
    window.addEventListener('app:new-lead', listener);

    expect(listener).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  it('should not trigger shortcuts in contentEditable elements', () => {
    render(<GlobalShortcuts />);

    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    div.focus();

    const rEvent = new KeyboardEvent('keydown', { key: 'r', bubbles: true });
    Object.defineProperty(rEvent, 'target', { value: div, enumerable: true });
    div.dispatchEvent(rEvent);

    const listener = vi.fn();
    window.addEventListener('app:refresh', listener);

    expect(listener).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it('should not trigger r shortcut with modifier keys', () => {
    render(<GlobalShortcuts />);

    const listener = vi.fn();
    window.addEventListener('app:refresh', listener);

    const rEventCtrl = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true });
    document.dispatchEvent(rEventCtrl);

    expect(listener).not.toHaveBeenCalled();
  });

  it('should clean up event listeners on unmount', () => {
    const { unmount } = render(<GlobalShortcuts />);

    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('should prevent default behavior for navigation shortcuts', () => {
    render(<GlobalShortcuts />);

    const gEvent = new KeyboardEvent('keydown', { key: 'g' });
    const preventDefaultSpy = vi.spyOn(gEvent, 'preventDefault');
    document.dispatchEvent(gEvent);

    const dEvent = new KeyboardEvent('keydown', { key: 'd' });
    const preventDefaultSpy2 = vi.spyOn(dEvent, 'preventDefault');
    document.dispatchEvent(dEvent);

    expect(preventDefaultSpy2).toHaveBeenCalled();
  });

  it('should handle case-insensitive navigation keys', () => {
    render(<GlobalShortcuts />);

    const gEvent = new KeyboardEvent('keydown', { key: 'g' });
    document.dispatchEvent(gEvent);

    const DEvent = new KeyboardEvent('keydown', { key: 'D' }); // Uppercase
    document.dispatchEvent(DEvent);

    expect(mockPush).toHaveBeenCalledWith('/');
  });
});
