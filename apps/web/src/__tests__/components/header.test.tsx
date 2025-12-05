import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '@/components/layout/header';

// Mock next-themes
vi.mock('next-themes', () => ({
  useTheme: vi.fn(() => ({
    theme: 'light',
    setTheme: vi.fn(),
  })),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock realtime components
vi.mock('@/components/realtime', () => ({
  ConnectionStatus: () => <div data-testid="connection-status">Connection Status</div>,
  NotificationBell: () => <div data-testid="notification-bell">Notification Bell</div>,
}));

// Mock language switcher
vi.mock('@/components/i18n/language-switcher', () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher">Language Switcher</div>,
}));

// Mock sidebar
vi.mock('@/components/layout/sidebar', () => ({
  MobileMenuTrigger: () => <button data-testid="mobile-menu-trigger">Menu</button>,
  useSidebar: vi.fn(() => ({
    isMobile: false,
  })),
}));

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render header element', () => {
    render(<Header />);

    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('should render MedicalCor Cortex title on desktop', () => {
    const { useSidebar } = require('@/components/layout/sidebar');
    useSidebar.mockReturnValue({ isMobile: false });

    render(<Header />);

    expect(screen.getByText('MedicalCor Cortex')).toBeInTheDocument();
  });

  it('should render logo on mobile', () => {
    const { useSidebar } = require('@/components/layout/sidebar');
    useSidebar.mockReturnValue({ isMobile: true });

    render(<Header />);

    expect(screen.getByText('Cortex')).toBeInTheDocument();
  });

  it('should not render title on mobile', () => {
    const { useSidebar } = require('@/components/layout/sidebar');
    useSidebar.mockReturnValue({ isMobile: true });

    render(<Header />);

    expect(screen.queryByText('MedicalCor Cortex')).not.toBeInTheDocument();
  });

  it('should render ConnectionStatus component', () => {
    render(<Header />);

    expect(screen.getByTestId('connection-status')).toBeInTheDocument();
  });

  it('should render NotificationBell component', () => {
    render(<Header />);

    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
  });

  it('should render LanguageSwitcher component', () => {
    render(<Header />);

    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
  });

  it('should render theme toggle button', () => {
    render(<Header />);

    const themeButton = screen.getByRole('button', { name: /toggle theme/i });
    expect(themeButton).toBeInTheDocument();
  });

  it('should toggle theme when theme button is clicked', async () => {
    const user = userEvent.setup();
    const mockSetTheme = vi.fn();

    const { useTheme } = require('next-themes');
    useTheme.mockReturnValue({
      theme: 'light',
      setTheme: mockSetTheme,
    });

    render(<Header />);

    const themeButton = screen.getByRole('button', { name: /toggle theme/i });
    await user.click(themeButton);

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('should toggle from dark to light theme', async () => {
    const user = userEvent.setup();
    const mockSetTheme = vi.fn();

    const { useTheme } = require('next-themes');
    useTheme.mockReturnValue({
      theme: 'dark',
      setTheme: mockSetTheme,
    });

    render(<Header />);

    const themeButton = screen.getByRole('button', { name: /toggle theme/i });
    await user.click(themeButton);

    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('should render user menu button', () => {
    render(<Header />);

    expect(screen.getByRole('button', { name: /user menu/i })).toBeInTheDocument();
  });

  it('should have proper accessibility attributes on user menu', () => {
    render(<Header />);

    const userButton = screen.getByRole('button', { name: /user menu/i });
    expect(userButton).toHaveAttribute('aria-label', 'User menu');
  });

  it('should render MobileMenuTrigger on mobile', () => {
    const { useSidebar } = require('@/components/layout/sidebar');
    useSidebar.mockReturnValue({ isMobile: true });

    render(<Header />);

    expect(screen.getByTestId('mobile-menu-trigger')).toBeInTheDocument();
  });

  it('should have sticky positioning', () => {
    const { container } = render(<Header />);

    const header = container.querySelector('header');
    expect(header?.className).toContain('sticky');
    expect(header?.className).toContain('top-0');
  });

  it('should have backdrop blur effect', () => {
    const { container } = render(<Header />);

    const header = container.querySelector('header');
    expect(header?.className).toContain('backdrop-blur');
  });

  it('should have border bottom', () => {
    const { container } = render(<Header />);

    const header = container.querySelector('header');
    expect(header?.className).toContain('border-b');
  });

  it('should have proper z-index for layering', () => {
    const { container } = render(<Header />);

    const header = container.querySelector('header');
    expect(header?.className).toContain('z-30');
  });

  it('should render logo link to home on mobile', () => {
    const { useSidebar } = require('@/components/layout/sidebar');
    useSidebar.mockReturnValue({ isMobile: true });

    render(<Header />);

    const logoLink = screen.getByRole('link');
    expect(logoLink).toHaveAttribute('href', '/');
  });

  it('should hide ConnectionStatus on mobile', () => {
    const { useSidebar } = require('@/components/layout/sidebar');
    useSidebar.mockReturnValue({ isMobile: true });

    const { container } = render(<Header />);

    const connectionStatusContainer = container.querySelector('.hidden.sm\\:block');
    expect(connectionStatusContainer).toBeInTheDocument();
  });

  it('should have responsive padding', () => {
    const { container } = render(<Header />);

    const header = container.querySelector('header');
    expect(header?.className).toContain('px-4');
    expect(header?.className).toContain('sm:px-6');
  });

  it('should have responsive gap between items', () => {
    const { container } = render(<Header />);

    const leftSection = container.querySelector('.gap-2');
    expect(leftSection).toBeInTheDocument();
  });

  it('should render all action buttons in right section', () => {
    render(<Header />);

    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /user menu/i })).toBeInTheDocument();
  });

  it('should maintain header height', () => {
    const { container } = render(<Header />);

    const header = container.querySelector('header');
    expect(header?.className).toContain('h-16');
  });
});
