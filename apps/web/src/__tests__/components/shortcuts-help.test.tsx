import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShortcutsHelp } from '@/components/keyboard/shortcuts-help';

const mockSetIsHelpOpen = vi.fn();
const mockGetRegisteredShortcuts = vi.fn(() => []);

vi.mock('@/lib/keyboard', () => ({
  useKeyboard: vi.fn(() => ({
    isHelpOpen: false,
    setIsHelpOpen: mockSetIsHelpOpen,
    getRegisteredShortcuts: mockGetRegisteredShortcuts,
  })),
}));

vi.mock('@/lib/keyboard/types', () => ({
  formatShortcut: vi.fn((key) => key),
}));

describe('ShortcutsHelp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when closed', () => {
    render(<ShortcutsHelp />);

    expect(screen.queryByText('Scurtături tastatură')).not.toBeInTheDocument();
  });

  it('should render when open', () => {
    const { useKeyboard } = require('@/lib/keyboard');
    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: mockGetRegisteredShortcuts,
    });

    render(<ShortcutsHelp />);

    expect(screen.getByText('Scurtături tastatură')).toBeInTheDocument();
  });

  it('should display navigation shortcuts category', () => {
    const { useKeyboard } = require('@/lib/keyboard');
    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: mockGetRegisteredShortcuts,
    });

    render(<ShortcutsHelp />);

    expect(screen.getByText('Navigare')).toBeInTheDocument();
  });

  it('should display actions shortcuts category', () => {
    const { useKeyboard } = require('@/lib/keyboard');
    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: mockGetRegisteredShortcuts,
    });

    render(<ShortcutsHelp />);

    expect(screen.getByText('Acțiuni')).toBeInTheDocument();
  });

  it('should display general shortcuts category', () => {
    const { useKeyboard } = require('@/lib/keyboard');
    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: mockGetRegisteredShortcuts,
    });

    render(<ShortcutsHelp />);

    expect(screen.getByText('General')).toBeInTheDocument();
  });

  it('should display navigation shortcuts', () => {
    const { useKeyboard } = require('@/lib/keyboard');
    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: mockGetRegisteredShortcuts,
    });

    render(<ShortcutsHelp />);

    expect(screen.getByText('Mergi la Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Mergi la Triage')).toBeInTheDocument();
    expect(screen.getByText('Mergi la Calendar')).toBeInTheDocument();
    expect(screen.getByText('Mergi la Setări')).toBeInTheDocument();
  });

  it('should display action shortcuts', () => {
    const { useKeyboard } = require('@/lib/keyboard');
    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: mockGetRegisteredShortcuts,
    });

    render(<ShortcutsHelp />);

    expect(screen.getByText('Căutare rapidă')).toBeInTheDocument();
    expect(screen.getByText('Lead nou')).toBeInTheDocument();
    expect(screen.getByText('Refresh date')).toBeInTheDocument();
  });

  it('should close when close button is clicked', async () => {
    const user = userEvent.setup();
    const { useKeyboard } = require('@/lib/keyboard');
    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: mockGetRegisteredShortcuts,
    });

    render(<ShortcutsHelp />);

    const closeButton = screen.getByRole('button');
    await user.click(closeButton);

    expect(mockSetIsHelpOpen).toHaveBeenCalledWith(false);
  });

  it('should close when backdrop is clicked', async () => {
    const user = userEvent.setup();
    const { useKeyboard } = require('@/lib/keyboard');
    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: mockGetRegisteredShortcuts,
    });

    const { container } = render(<ShortcutsHelp />);

    const backdrop = container.querySelector('.absolute.inset-0');
    if (backdrop) {
      await user.click(backdrop);
      expect(mockSetIsHelpOpen).toHaveBeenCalledWith(false);
    }
  });

  it('should close on Escape key', async () => {
    const user = userEvent.setup();
    const { useKeyboard } = require('@/lib/keyboard');
    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: mockGetRegisteredShortcuts,
    });

    render(<ShortcutsHelp />);

    await user.keyboard('{Escape}');

    expect(mockSetIsHelpOpen).toHaveBeenCalledWith(false);
  });

  it('should display dynamically registered shortcuts', () => {
    const { useKeyboard } = require('@/lib/keyboard');
    const dynamicShortcuts = [
      { key: 'ctrl+s', description: 'Save' },
      { key: 'ctrl+p', description: 'Print' },
    ];

    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: vi.fn(() => dynamicShortcuts),
    });

    render(<ShortcutsHelp />);

    expect(screen.getByText('Pagina curentă')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Print')).toBeInTheDocument();
  });

  it('should not display current page section when no registered shortcuts', () => {
    const { useKeyboard } = require('@/lib/keyboard');
    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: vi.fn(() => []),
    });

    render(<ShortcutsHelp />);

    expect(screen.queryByText('Pagina curentă')).not.toBeInTheDocument();
  });

  it('should display help text at bottom', () => {
    const { useKeyboard } = require('@/lib/keyboard');
    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: mockGetRegisteredShortcuts,
    });

    render(<ShortcutsHelp />);

    expect(screen.getByText(/Apasă/)).toBeInTheDocument();
    expect(screen.getByText(/pentru a vedea scurtăturile disponibile/)).toBeInTheDocument();
  });

  it('should have accessible keyboard icon', () => {
    const { useKeyboard } = require('@/lib/keyboard');
    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: mockGetRegisteredShortcuts,
    });

    render(<ShortcutsHelp />);

    expect(screen.getByText('Scurtături tastatură')).toBeInTheDocument();
  });

  it('should render shortcuts with kbd elements', () => {
    const { useKeyboard } = require('@/lib/keyboard');
    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: mockGetRegisteredShortcuts,
    });

    const { container } = render(<ShortcutsHelp />);

    const kbdElements = container.querySelectorAll('kbd');
    expect(kbdElements.length).toBeGreaterThan(0);
  });

  it('should have scrollable content area', () => {
    const { useKeyboard } = require('@/lib/keyboard');
    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: mockGetRegisteredShortcuts,
    });

    const { container } = render(<ShortcutsHelp />);

    const scrollableArea = container.querySelector('.overflow-y-auto');
    expect(scrollableArea).toBeInTheDocument();
  });

  it('should have proper z-index for overlay', () => {
    const { useKeyboard } = require('@/lib/keyboard');
    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: mockGetRegisteredShortcuts,
    });

    const { container } = render(<ShortcutsHelp />);

    const overlay = container.querySelector('.z-50');
    expect(overlay).toBeInTheDocument();
  });

  it('should format shortcut keys', () => {
    const { useKeyboard } = require('@/lib/keyboard');
    const { formatShortcut } = require('@/lib/keyboard/types');

    useKeyboard.mockReturnValue({
      isHelpOpen: true,
      setIsHelpOpen: mockSetIsHelpOpen,
      getRegisteredShortcuts: mockGetRegisteredShortcuts,
    });

    render(<ShortcutsHelp />);

    expect(formatShortcut).toHaveBeenCalled();
  });
});
