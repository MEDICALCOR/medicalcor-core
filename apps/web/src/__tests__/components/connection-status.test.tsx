import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionStatus } from '@/components/realtime/connection-status';

// Mock the useRealtimeConnection hook
vi.mock('@/lib/realtime', () => ({
  useRealtimeConnection: vi.fn(() => ({
    connectionState: { status: 'connected', reconnectAttempts: 0 },
    connect: vi.fn(),
  })),
}));

describe('ConnectionStatus', () => {
  it('should render status container', () => {
    render(<ConnectionStatus />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('should have proper accessibility attributes', () => {
    render(<ConnectionStatus />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('should show "Live" when connected', () => {
    const { useRealtimeConnection } = require('@/lib/realtime');
    useRealtimeConnection.mockReturnValue({
      connectionState: { status: 'connected', reconnectAttempts: 0 },
      connect: vi.fn(),
    });

    render(<ConnectionStatus />);

    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('should show green indicator when connected', () => {
    const { useRealtimeConnection } = require('@/lib/realtime');
    useRealtimeConnection.mockReturnValue({
      connectionState: { status: 'connected', reconnectAttempts: 0 },
      connect: vi.fn(),
    });

    render(<ConnectionStatus />);

    const indicator = screen.getByRole('status').querySelector('.bg-green-500');
    expect(indicator).toBeInTheDocument();
  });

  it('should show "Connecting..." when connecting', () => {
    const { useRealtimeConnection } = require('@/lib/realtime');
    useRealtimeConnection.mockReturnValue({
      connectionState: { status: 'connecting', reconnectAttempts: 0 },
      connect: vi.fn(),
    });

    render(<ConnectionStatus />);

    expect(screen.getByText('Connecting...')).toBeInTheDocument();
  });

  it('should show yellow pulsing indicator when connecting', () => {
    const { useRealtimeConnection } = require('@/lib/realtime');
    useRealtimeConnection.mockReturnValue({
      connectionState: { status: 'connecting', reconnectAttempts: 0 },
      connect: vi.fn(),
    });

    render(<ConnectionStatus />);

    const indicator = screen.getByRole('status').querySelector('.bg-yellow-500.animate-pulse');
    expect(indicator).toBeInTheDocument();
  });

  it('should show "Reconnect" button when disconnected', () => {
    const { useRealtimeConnection } = require('@/lib/realtime');
    useRealtimeConnection.mockReturnValue({
      connectionState: { status: 'disconnected', reconnectAttempts: 0 },
      connect: vi.fn(),
    });

    render(<ConnectionStatus />);

    expect(screen.getByRole('button', { name: /reconnect to server/i })).toBeInTheDocument();
  });

  it('should show gray indicator when disconnected', () => {
    const { useRealtimeConnection } = require('@/lib/realtime');
    useRealtimeConnection.mockReturnValue({
      connectionState: { status: 'disconnected', reconnectAttempts: 0 },
      connect: vi.fn(),
    });

    render(<ConnectionStatus />);

    const indicator = screen.getByRole('status').querySelector('.bg-gray-400');
    expect(indicator).toBeInTheDocument();
  });

  it('should call connect when Reconnect button is clicked', async () => {
    const user = userEvent.setup();
    const mockConnect = vi.fn();

    const { useRealtimeConnection } = require('@/lib/realtime');
    useRealtimeConnection.mockReturnValue({
      connectionState: { status: 'disconnected', reconnectAttempts: 0 },
      connect: mockConnect,
    });

    render(<ConnectionStatus />);

    const reconnectButton = screen.getByRole('button', { name: /reconnect to server/i });
    await user.click(reconnectButton);

    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('should show "Retry" button when in error state', () => {
    const { useRealtimeConnection } = require('@/lib/realtime');
    useRealtimeConnection.mockReturnValue({
      connectionState: { status: 'error', reconnectAttempts: 0 },
      connect: vi.fn(),
    });

    render(<ConnectionStatus />);

    expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
  });

  it('should show red indicator when in error state', () => {
    const { useRealtimeConnection } = require('@/lib/realtime');
    useRealtimeConnection.mockReturnValue({
      connectionState: { status: 'error', reconnectAttempts: 0 },
      connect: vi.fn(),
    });

    render(<ConnectionStatus />);

    const indicator = screen.getByRole('status').querySelector('.bg-red-500');
    expect(indicator).toBeInTheDocument();
  });

  it('should call connect when Retry button is clicked', async () => {
    const user = userEvent.setup();
    const mockConnect = vi.fn();

    const { useRealtimeConnection } = require('@/lib/realtime');
    useRealtimeConnection.mockReturnValue({
      connectionState: { status: 'error', reconnectAttempts: 0 },
      connect: mockConnect,
    });

    render(<ConnectionStatus />);

    const retryButton = screen.getByRole('button', { name: /retry connection/i });
    await user.click(retryButton);

    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('should show reconnect attempts when greater than 0 and not connected', () => {
    const { useRealtimeConnection } = require('@/lib/realtime');
    useRealtimeConnection.mockReturnValue({
      connectionState: { status: 'connecting', reconnectAttempts: 3 },
      connect: vi.fn(),
    });

    render(<ConnectionStatus />);

    expect(screen.getByText('(attempt 3)')).toBeInTheDocument();
  });

  it('should not show reconnect attempts when connected', () => {
    const { useRealtimeConnection } = require('@/lib/realtime');
    useRealtimeConnection.mockReturnValue({
      connectionState: { status: 'connected', reconnectAttempts: 3 },
      connect: vi.fn(),
    });

    render(<ConnectionStatus />);

    expect(screen.queryByText(/attempt/)).not.toBeInTheDocument();
  });

  it('should not show reconnect attempts when 0', () => {
    const { useRealtimeConnection } = require('@/lib/realtime');
    useRealtimeConnection.mockReturnValue({
      connectionState: { status: 'disconnected', reconnectAttempts: 0 },
      connect: vi.fn(),
    });

    render(<ConnectionStatus />);

    expect(screen.queryByText(/attempt/)).not.toBeInTheDocument();
  });

  it('should have underline style on reconnect button', () => {
    const { useRealtimeConnection } = require('@/lib/realtime');
    useRealtimeConnection.mockReturnValue({
      connectionState: { status: 'disconnected', reconnectAttempts: 0 },
      connect: vi.fn(),
    });

    render(<ConnectionStatus />);

    const reconnectButton = screen.getByRole('button', { name: /reconnect to server/i });
    expect(reconnectButton.className).toContain('underline');
  });

  it('should have red color on retry button', () => {
    const { useRealtimeConnection } = require('@/lib/realtime');
    useRealtimeConnection.mockReturnValue({
      connectionState: { status: 'error', reconnectAttempts: 0 },
      connect: vi.fn(),
    });

    render(<ConnectionStatus />);

    const retryButton = screen.getByRole('button', { name: /retry connection/i });
    expect(retryButton.className).toContain('text-red-500');
  });

  it('should hide indicator icon from screen readers', () => {
    const { useRealtimeConnection } = require('@/lib/realtime');
    useRealtimeConnection.mockReturnValue({
      connectionState: { status: 'connected', reconnectAttempts: 0 },
      connect: vi.fn(),
    });

    render(<ConnectionStatus />);

    const indicator = screen.getByRole('status').querySelector('[aria-hidden="true"]');
    expect(indicator).toBeInTheDocument();
  });
});
