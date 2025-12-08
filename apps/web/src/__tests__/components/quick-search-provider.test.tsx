// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  QuickSearchProvider,
  useQuickSearch,
} from '@/components/quick-search/quick-search-provider';

function TestComponent() {
  const { open, setOpen, toggle } = useQuickSearch();
  return (
    <div>
      <div data-testid="open-state">{open.toString()}</div>
      <button onClick={() => setOpen(true)}>Open</button>
      <button onClick={() => setOpen(false)}>Close</button>
      <button onClick={toggle}>Toggle</button>
    </div>
  );
}

vi.mock('@/components/quick-search/command-palette', () => ({
  CommandPalette: ({ open, onOpenChange }: any) => (
    <div data-testid="command-palette" data-open={open}>
      Command Palette
      <button onClick={() => onOpenChange(false)}>Close Palette</button>
    </div>
  ),
}));

describe('QuickSearchProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render children', () => {
    render(
      <QuickSearchProvider>
        <div>Test Content</div>
      </QuickSearchProvider>
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('should render CommandPalette', () => {
    render(
      <QuickSearchProvider>
        <div>Test</div>
      </QuickSearchProvider>
    );

    expect(screen.getByTestId('command-palette')).toBeInTheDocument();
  });

  it('should start with palette closed', () => {
    render(
      <QuickSearchProvider>
        <TestComponent />
      </QuickSearchProvider>
    );

    expect(screen.getByTestId('open-state')).toHaveTextContent('false');
  });

  it('should open palette when setOpen(true) is called', async () => {
    const { user } = await import('@testing-library/user-event');
    const userEvent = user.setup();

    render(
      <QuickSearchProvider>
        <TestComponent />
      </QuickSearchProvider>
    );

    await userEvent.click(screen.getByText('Open'));

    expect(screen.getByTestId('open-state')).toHaveTextContent('true');
  });

  it('should close palette when setOpen(false) is called', async () => {
    const { user } = await import('@testing-library/user-event');
    const userEvent = user.setup();

    render(
      <QuickSearchProvider>
        <TestComponent />
      </QuickSearchProvider>
    );

    await userEvent.click(screen.getByText('Open'));
    expect(screen.getByTestId('open-state')).toHaveTextContent('true');

    await userEvent.click(screen.getByText('Close'));
    expect(screen.getByTestId('open-state')).toHaveTextContent('false');
  });

  it('should toggle palette state', async () => {
    const { user } = await import('@testing-library/user-event');
    const userEvent = user.setup();

    render(
      <QuickSearchProvider>
        <TestComponent />
      </QuickSearchProvider>
    );

    expect(screen.getByTestId('open-state')).toHaveTextContent('false');

    await userEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('open-state')).toHaveTextContent('true');

    await userEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('open-state')).toHaveTextContent('false');
  });

  it('should open on Ctrl+K', () => {
    render(
      <QuickSearchProvider>
        <TestComponent />
      </QuickSearchProvider>
    );

    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    document.dispatchEvent(event);

    expect(screen.getByTestId('open-state')).toHaveTextContent('true');
  });

  it('should open on Meta+K (Mac)', () => {
    render(
      <QuickSearchProvider>
        <TestComponent />
      </QuickSearchProvider>
    );

    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    document.dispatchEvent(event);

    expect(screen.getByTestId('open-state')).toHaveTextContent('true');
  });

  it('should throw error when useQuickSearch used outside provider', () => {
    // Suppress console.error for this test
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useQuickSearch must be used within QuickSearchProvider');

    consoleError.mockRestore();
  });

  it('should clean up keyboard listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    const { unmount } = render(
      <QuickSearchProvider>
        <div>Test</div>
      </QuickSearchProvider>
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
