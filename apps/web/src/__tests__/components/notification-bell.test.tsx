import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationBell } from '@/components/realtime/notification-bell';

const mockUrgencies = [
  {
    id: '1',
    phone: '+40123456789',
    reason: 'Durere de dinti acuta',
    waitingTime: 30,
    priority: 'critical' as const,
  },
  {
    id: '2',
    phone: '+40987654321',
    reason: 'Control periodic',
    waitingTime: 90,
    priority: 'medium' as const,
  },
];

// Mock the useRealtimeUrgencies hook
vi.mock('@/lib/realtime', () => ({
  useRealtimeUrgencies: vi.fn(() => ({
    urgencies: [],
    unreadCount: 0,
    markUrgencyRead: vi.fn(),
    clearAllUrgencies: vi.fn(),
    isUrgencyRead: vi.fn(() => false),
  })),
}));

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render bell button', () => {
    render(<NotificationBell />);

    expect(screen.getByRole('button', { name: /notificări/i })).toBeInTheDocument();
  });

  it('should show unread count badge when there are unread notifications', () => {
    const { useRealtimeUrgencies } = require('@/lib/realtime');
    useRealtimeUrgencies.mockReturnValue({
      urgencies: mockUrgencies,
      unreadCount: 2,
      markUrgencyRead: vi.fn(),
      clearAllUrgencies: vi.fn(),
      isUrgencyRead: vi.fn(() => false),
    });

    render(<NotificationBell />);

    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should show "9+" when unread count exceeds 9', () => {
    const { useRealtimeUrgencies } = require('@/lib/realtime');
    useRealtimeUrgencies.mockReturnValue({
      urgencies: [],
      unreadCount: 15,
      markUrgencyRead: vi.fn(),
      clearAllUrgencies: vi.fn(),
      isUrgencyRead: vi.fn(() => false),
    });

    render(<NotificationBell />);

    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('should not show badge when unread count is 0', () => {
    const { useRealtimeUrgencies } = require('@/lib/realtime');
    useRealtimeUrgencies.mockReturnValue({
      urgencies: [],
      unreadCount: 0,
      markUrgencyRead: vi.fn(),
      clearAllUrgencies: vi.fn(),
      isUrgencyRead: vi.fn(() => false),
    });

    render(<NotificationBell />);

    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it('should open dropdown when bell is clicked', async () => {
    const user = userEvent.setup();
    const { useRealtimeUrgencies } = require('@/lib/realtime');
    useRealtimeUrgencies.mockReturnValue({
      urgencies: mockUrgencies,
      unreadCount: 2,
      markUrgencyRead: vi.fn(),
      clearAllUrgencies: vi.fn(),
      isUrgencyRead: vi.fn(() => false),
    });

    render(<NotificationBell />);

    const button = screen.getByRole('button', { name: /notificări/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  it('should show urgencies list when dropdown is open', async () => {
    const user = userEvent.setup();
    const { useRealtimeUrgencies } = require('@/lib/realtime');
    useRealtimeUrgencies.mockReturnValue({
      urgencies: mockUrgencies,
      unreadCount: 2,
      markUrgencyRead: vi.fn(),
      clearAllUrgencies: vi.fn(),
      isUrgencyRead: vi.fn(() => false),
    });

    render(<NotificationBell />);

    await user.click(screen.getByRole('button', { name: /notificări/i }));

    await waitFor(() => {
      expect(screen.getByText('+40123456789')).toBeInTheDocument();
      expect(screen.getByText('Durere de dinti acuta')).toBeInTheDocument();
      expect(screen.getByText('+40987654321')).toBeInTheDocument();
      expect(screen.getByText('Control periodic')).toBeInTheDocument();
    });
  });

  it('should show "Nu sunt urgențe noi" when no urgencies', async () => {
    const user = userEvent.setup();
    const { useRealtimeUrgencies } = require('@/lib/realtime');
    useRealtimeUrgencies.mockReturnValue({
      urgencies: [],
      unreadCount: 0,
      markUrgencyRead: vi.fn(),
      clearAllUrgencies: vi.fn(),
      isUrgencyRead: vi.fn(() => false),
    });

    render(<NotificationBell />);

    await user.click(screen.getByRole('button', { name: /notificări/i }));

    await waitFor(() => {
      expect(screen.getByText('Nu sunt urgențe noi')).toBeInTheDocument();
    });
  });

  it('should format waiting time correctly for minutes', async () => {
    const user = userEvent.setup();
    const { useRealtimeUrgencies } = require('@/lib/realtime');
    useRealtimeUrgencies.mockReturnValue({
      urgencies: [{ ...mockUrgencies[0], waitingTime: 45 }],
      unreadCount: 1,
      markUrgencyRead: vi.fn(),
      clearAllUrgencies: vi.fn(),
      isUrgencyRead: vi.fn(() => false),
    });

    render(<NotificationBell />);

    await user.click(screen.getByRole('button', { name: /notificări/i }));

    await waitFor(() => {
      expect(screen.getByText('45 min așteptare')).toBeInTheDocument();
    });
  });

  it('should format waiting time correctly for hours', async () => {
    const user = userEvent.setup();
    const { useRealtimeUrgencies } = require('@/lib/realtime');
    useRealtimeUrgencies.mockReturnValue({
      urgencies: [{ ...mockUrgencies[0], waitingTime: 125 }],
      unreadCount: 1,
      markUrgencyRead: vi.fn(),
      clearAllUrgencies: vi.fn(),
      isUrgencyRead: vi.fn(() => false),
    });

    render(<NotificationBell />);

    await user.click(screen.getByRole('button', { name: /notificări/i }));

    await waitFor(() => {
      expect(screen.getByText('2h 5m așteptare')).toBeInTheDocument();
    });
  });

  it('should call markUrgencyRead when urgency is clicked', async () => {
    const user = userEvent.setup();
    const mockMarkRead = vi.fn();
    const { useRealtimeUrgencies } = require('@/lib/realtime');
    useRealtimeUrgencies.mockReturnValue({
      urgencies: mockUrgencies,
      unreadCount: 2,
      markUrgencyRead: mockMarkRead,
      clearAllUrgencies: vi.fn(),
      isUrgencyRead: vi.fn(() => false),
    });

    render(<NotificationBell />);

    await user.click(screen.getByRole('button', { name: /notificări/i }));

    const urgency = screen.getByRole('menuitem', { name: /\+40123456789/i });
    await user.click(urgency);

    expect(mockMarkRead).toHaveBeenCalledWith('1');
  });

  it('should call clearAllUrgencies when "Marchează toate citite" is clicked', async () => {
    const user = userEvent.setup();
    const mockClearAll = vi.fn();
    const { useRealtimeUrgencies } = require('@/lib/realtime');
    useRealtimeUrgencies.mockReturnValue({
      urgencies: mockUrgencies,
      unreadCount: 2,
      markUrgencyRead: vi.fn(),
      clearAllUrgencies: mockClearAll,
      isUrgencyRead: vi.fn(() => false),
    });

    render(<NotificationBell />);

    await user.click(screen.getByRole('button', { name: /notificări/i }));

    const clearButton = screen.getByRole('button', {
      name: /marchează toate notificările ca citite/i,
    });
    await user.click(clearButton);

    expect(mockClearAll).toHaveBeenCalledTimes(1);
  });

  it('should not show "Marchează toate citite" when no urgencies', async () => {
    const user = userEvent.setup();
    const { useRealtimeUrgencies } = require('@/lib/realtime');
    useRealtimeUrgencies.mockReturnValue({
      urgencies: [],
      unreadCount: 0,
      markUrgencyRead: vi.fn(),
      clearAllUrgencies: vi.fn(),
      isUrgencyRead: vi.fn(() => false),
    });

    render(<NotificationBell />);

    await user.click(screen.getByRole('button', { name: /notificări/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /marchează toate/i })
      ).not.toBeInTheDocument();
    });
  });

  it('should close dropdown when clicking outside', async () => {
    const user = userEvent.setup();
    const { useRealtimeUrgencies } = require('@/lib/realtime');
    useRealtimeUrgencies.mockReturnValue({
      urgencies: mockUrgencies,
      unreadCount: 2,
      markUrgencyRead: vi.fn(),
      clearAllUrgencies: vi.fn(),
      isUrgencyRead: vi.fn(() => false),
    });

    render(
      <div>
        <NotificationBell />
        <button>Outside</button>
      </div>
    );

    await user.click(screen.getByRole('button', { name: /notificări/i }));

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Outside'));

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('should close dropdown when pressing Escape', async () => {
    const user = userEvent.setup();
    const { useRealtimeUrgencies } = require('@/lib/realtime');
    useRealtimeUrgencies.mockReturnValue({
      urgencies: mockUrgencies,
      unreadCount: 2,
      markUrgencyRead: vi.fn(),
      clearAllUrgencies: vi.fn(),
      isUrgencyRead: vi.fn(() => false),
    });

    render(<NotificationBell />);

    await user.click(screen.getByRole('button', { name: /notificări/i }));

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('should highlight unread urgencies', async () => {
    const user = userEvent.setup();
    const { useRealtimeUrgencies } = require('@/lib/realtime');
    useRealtimeUrgencies.mockReturnValue({
      urgencies: mockUrgencies,
      unreadCount: 1,
      markUrgencyRead: vi.fn(),
      clearAllUrgencies: vi.fn(),
      isUrgencyRead: vi.fn((id) => id !== '1'),
    });

    render(<NotificationBell />);

    await user.click(screen.getByRole('button', { name: /notificări/i }));

    await waitFor(() => {
      const unreadUrgency = screen.getByRole('menuitem', { name: /\+40123456789/i });
      expect(unreadUrgency.className).toContain('bg-primary/5');
    });
  });

  it('should support keyboard navigation on urgencies', async () => {
    const user = userEvent.setup();
    const mockMarkRead = vi.fn();
    const { useRealtimeUrgencies } = require('@/lib/realtime');
    useRealtimeUrgencies.mockReturnValue({
      urgencies: mockUrgencies,
      unreadCount: 2,
      markUrgencyRead: mockMarkRead,
      clearAllUrgencies: vi.fn(),
      isUrgencyRead: vi.fn(() => false),
    });

    render(<NotificationBell />);

    await user.click(screen.getByRole('button', { name: /notificări/i }));

    const urgency = screen.getByRole('menuitem', { name: /\+40123456789/i });
    urgency.focus();
    await user.keyboard('{Enter}');

    expect(mockMarkRead).toHaveBeenCalledWith('1');
  });

  it('should have proper ARIA attributes on bell button', () => {
    const { useRealtimeUrgencies } = require('@/lib/realtime');
    useRealtimeUrgencies.mockReturnValue({
      urgencies: mockUrgencies,
      unreadCount: 2,
      markUrgencyRead: vi.fn(),
      clearAllUrgencies: vi.fn(),
      isUrgencyRead: vi.fn(() => false),
    });

    render(<NotificationBell />);

    const button = screen.getByRole('button', { name: /notificări \(2 necitite\)/i });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});
