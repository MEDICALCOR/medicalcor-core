import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from '@/components/quick-search/command-palette';

const mockPush = vi.fn();
const mockOnOpenChange = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/lib/quick-search', () => ({
  allCommandGroups: [
    {
      label: 'Navigation',
      commands: [
        { id: 'nav-1', type: 'navigation', label: 'Dashboard', href: '/', icon: 'LayoutDashboard' },
        { id: 'nav-2', type: 'navigation', label: 'Patients', href: '/patients', icon: 'Users' },
      ],
    },
  ],
  mockPatients: [
    { id: 'p1', name: 'Ion Popescu', phone: '+40123456789' },
    { id: 'p2', name: 'Maria Ionescu', phone: '+40987654321' },
  ],
}));

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when closed', () => {
    render(<CommandPalette open={false} onOpenChange={mockOnOpenChange} />);

    expect(screen.queryByPlaceholderText(/caută/i)).not.toBeInTheDocument();
  });

  it('should render when open', () => {
    render(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByPlaceholderText(/caută/i)).toBeInTheDocument();
  });

  it('should display search input', () => {
    render(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByPlaceholderText('Caută comenzi, pagini, pacienți...')).toBeInTheDocument();
  });

  it('should show all commands when query is empty', () => {
    render(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Patients')).toBeInTheDocument();
  });

  it('should filter commands by query', async () => {
    const user = userEvent.setup();
    render(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    const input = screen.getByPlaceholderText(/caută/i);
    await user.type(input, 'dashboard');

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Patients')).not.toBeInTheDocument();
  });

  it('should search patients by name', async () => {
    const user = userEvent.setup();
    render(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    await user.type(screen.getByPlaceholderText(/caută/i), 'Ion');

    expect(screen.getByText('Ion Popescu')).toBeInTheDocument();
  });

  it('should search patients by phone', async () => {
    const user = userEvent.setup();
    render(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    await user.type(screen.getByPlaceholderText(/caută/i), '+40123');

    expect(screen.getByText('Ion Popescu')).toBeInTheDocument();
  });

  it('should navigate when navigation result is clicked', async () => {
    const user = userEvent.setup();
    render(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    await user.click(screen.getByText('Dashboard'));

    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('should navigate on Enter key', async () => {
    const user = userEvent.setup();
    render(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    await user.keyboard('{Enter}');

    expect(mockPush).toHaveBeenCalled();
  });

  it('should navigate with arrow keys', async () => {
    const user = userEvent.setup();
    render(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowUp}');

    // Should highlight different results
    expect(screen.getByPlaceholderText(/caută/i)).toBeInTheDocument();
  });

  it('should close on Escape', async () => {
    const user = userEvent.setup();
    render(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    const input = screen.getByPlaceholderText(/caută/i);
    await user.type(input, '{Escape}');

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('should show empty state when no results', async () => {
    const user = userEvent.setup();
    render(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    await user.type(screen.getByPlaceholderText(/caută/i), 'xyz123notfound');

    expect(screen.getByText(/nu am găsit rezultate/i)).toBeInTheDocument();
  });

  it('should group results by type', () => {
    render(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText('Navigare')).toBeInTheDocument();
  });

  it('should display keyboard shortcuts help', () => {
    render(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText('navigare')).toBeInTheDocument();
    expect(screen.getByText('selectare')).toBeInTheDocument();
    expect(screen.getByText('închide')).toBeInTheDocument();
  });

  it('should autofocus input when opened', () => {
    render(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    const input = screen.getByPlaceholderText(/caută/i);
    expect(input).toHaveFocus();
  });

  it('should reset query when closed', () => {
    const { rerender } = render(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    const input = screen.getByPlaceholderText(/caută/i) as HTMLInputElement;
    userEvent.type(input, 'test');

    rerender(<CommandPalette open={false} onOpenChange={mockOnOpenChange} />);
    rerender(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    expect(input.value).toBe('');
  });
});
