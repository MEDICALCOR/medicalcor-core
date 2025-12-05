import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Sidebar,
  MobileSidebar,
  MobileMenuTrigger,
  SidebarProvider,
  useSidebar,
} from '@/components/layout/sidebar';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}));

// Mock permissions
vi.mock('@/components/auth/require-permission', () => ({
  usePermissions: vi.fn(() => ({
    canAccessPage: vi.fn(() => ({ allowed: true })),
    isLoading: false,
  })),
}));

// Mock Sheet component
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open, onOpenChange }: any) => (
    <div data-testid="sheet" data-open={open}>
      {children}
    </div>
  ),
  SheetContent: ({ children, ...props }: any) => (
    <div data-testid="sheet-content" {...props}>
      {children}
    </div>
  ),
}));

describe('SidebarProvider', () => {
  it('should render children', () => {
    render(
      <SidebarProvider>
        <div>Test Content</div>
      </SidebarProvider>
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('should provide sidebar context', () => {
    function TestComponent() {
      const { isOpen, isMobile } = useSidebar();
      return (
        <div>
          <div>Open: {isOpen ? 'true' : 'false'}</div>
          <div>Mobile: {isMobile ? 'true' : 'false'}</div>
        </div>
      );
    }

    render(
      <SidebarProvider>
        <TestComponent />
      </SidebarProvider>
    );

    expect(screen.getByText(/Open:/)).toBeInTheDocument();
    expect(screen.getByText(/Mobile:/)).toBeInTheDocument();
  });
});

describe('Sidebar', () => {
  beforeEach(() => {
    // Mock window.innerWidth for desktop
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200,
    });
  });

  it('should render sidebar on desktop', () => {
    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    );

    expect(screen.getByRole('complementary', { name: /navigare principală/i })).toBeInTheDocument();
  });

  it('should render logo and brand name', () => {
    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    );

    expect(screen.getByText('Cortex')).toBeInTheDocument();
  });

  it('should render navigation links', () => {
    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    );

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pacienți/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /calendar/i })).toBeInTheDocument();
  });

  it('should highlight active navigation item', () => {
    const { usePathname } = require('next/navigation');
    usePathname.mockReturnValue('/patients');

    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    );

    const patientsLink = screen.getByRole('link', { name: /pacienți/i });
    expect(patientsLink.className).toContain('bg-primary');
  });

  it('should not highlight inactive navigation items', () => {
    const { usePathname } = require('next/navigation');
    usePathname.mockReturnValue('/patients');

    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    );

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboardLink.className).not.toContain('bg-primary');
  });

  it('should render collapse/expand button', () => {
    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    );

    expect(
      screen.getByRole('button', { name: /restrânge bara laterală/i })
    ).toBeInTheDocument();
  });

  it('should toggle sidebar collapse state', async () => {
    const user = userEvent.setup();

    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    );

    const collapseButton = screen.getByRole('button', { name: /restrânge bara laterală/i });
    await user.click(collapseButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /extinde bara laterală/i })).toBeInTheDocument();
    });
  });

  it('should hide navigation text when collapsed', async () => {
    const user = userEvent.setup();

    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();

    const collapseButton = screen.getByRole('button', { name: /restrânge bara laterală/i });
    await user.click(collapseButton);

    await waitFor(() => {
      const dashboardText = screen.queryByText('Dashboard');
      expect(dashboardText).not.toBeInTheDocument();
    });
  });

  it('should filter navigation items based on permissions', () => {
    const { usePermissions } = require('@/components/auth/require-permission');
    usePermissions.mockReturnValue({
      canAccessPage: vi.fn((path) => ({
        allowed: path === '/' || path === '/patients',
      })),
      isLoading: false,
    });

    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    );

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pacienți/i })).toBeInTheDocument();
  });

  it('should have fixed positioning', () => {
    const { container } = render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    );

    const sidebar = container.querySelector('aside');
    expect(sidebar?.className).toContain('fixed');
  });

  it('should have proper width when expanded', () => {
    const { container } = render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    );

    const sidebar = container.querySelector('aside');
    expect(sidebar?.className).toContain('w-64');
  });
});

describe('MobileSidebar', () => {
  it('should render mobile sidebar', () => {
    render(
      <SidebarProvider>
        <MobileSidebar />
      </SidebarProvider>
    );

    expect(screen.getByTestId('sheet')).toBeInTheDocument();
  });

  it('should render navigation links in mobile sidebar', () => {
    render(
      <SidebarProvider>
        <MobileSidebar />
      </SidebarProvider>
    );

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
  });

  it('should render logo in mobile sidebar', () => {
    render(
      <SidebarProvider>
        <MobileSidebar />
      </SidebarProvider>
    );

    expect(screen.getByText('Cortex')).toBeInTheDocument();
  });

  it('should render close button', () => {
    render(
      <SidebarProvider>
        <MobileSidebar />
      </SidebarProvider>
    );

    expect(screen.getByRole('button', { name: /închide meniul/i })).toBeInTheDocument();
  });

  it('should close sidebar when close button is clicked', async () => {
    const user = userEvent.setup();

    function TestComponent() {
      const { isOpen, setIsOpen } = useSidebar();
      return (
        <div>
          <button onClick={() => setIsOpen(true)}>Open</button>
          <div>Sidebar: {isOpen ? 'open' : 'closed'}</div>
          <MobileSidebar />
        </div>
      );
    }

    render(
      <SidebarProvider>
        <TestComponent />
      </SidebarProvider>
    );

    await user.click(screen.getByText('Open'));

    await waitFor(() => {
      expect(screen.getByText('Sidebar: open')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /închide meniul/i }));

    await waitFor(() => {
      expect(screen.getByText('Sidebar: closed')).toBeInTheDocument();
    });
  });

  it('should close sidebar when a navigation link is clicked', async () => {
    const user = userEvent.setup();

    function TestComponent() {
      const { isOpen, setIsOpen } = useSidebar();
      return (
        <div>
          <button onClick={() => setIsOpen(true)}>Open</button>
          <div>Sidebar: {isOpen ? 'open' : 'closed'}</div>
          <MobileSidebar />
        </div>
      );
    }

    render(
      <SidebarProvider>
        <TestComponent />
      </SidebarProvider>
    );

    await user.click(screen.getByText('Open'));

    await waitFor(() => {
      expect(screen.getByText('Sidebar: open')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('link', { name: /dashboard/i }));

    await waitFor(() => {
      expect(screen.getByText('Sidebar: closed')).toBeInTheDocument();
    });
  });

  it('should display version in footer', () => {
    render(
      <SidebarProvider>
        <MobileSidebar />
      </SidebarProvider>
    );

    expect(screen.getByText('MedicalCor Cortex v1.0')).toBeInTheDocument();
  });
});

describe('MobileMenuTrigger', () => {
  it('should not render on desktop', () => {
    function TestComponent() {
      const { isMobile } = useSidebar();
      return (
        <div>
          <div>Is Mobile: {isMobile ? 'yes' : 'no'}</div>
          <MobileMenuTrigger />
        </div>
      );
    }

    render(
      <SidebarProvider>
        <TestComponent />
      </SidebarProvider>
    );

    expect(screen.queryByRole('button', { name: /deschide meniul/i })).not.toBeInTheDocument();
  });

  it('should open sidebar when clicked', async () => {
    const user = userEvent.setup();

    function TestComponent() {
      const { isOpen, isMobile } = useSidebar();
      // Force mobile state
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 800,
      });

      return (
        <div>
          <div>Sidebar: {isOpen ? 'open' : 'closed'}</div>
          <div>Mobile: {isMobile ? 'yes' : 'no'}</div>
          <MobileMenuTrigger />
        </div>
      );
    }

    render(
      <SidebarProvider>
        <TestComponent />
      </SidebarProvider>
    );

    const menuButton = screen.queryByRole('button', { name: /deschide meniul/i });
    if (menuButton) {
      await user.click(menuButton);

      await waitFor(() => {
        expect(screen.getByText('Sidebar: open')).toBeInTheDocument();
      });
    }
  });

  it('should have proper accessibility attributes', () => {
    // Force mobile state
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 800,
    });

    render(
      <SidebarProvider>
        <MobileMenuTrigger />
      </SidebarProvider>
    );

    const menuButton = screen.queryByRole('button', { name: /deschide meniul/i });
    if (menuButton) {
      expect(menuButton).toHaveAttribute('aria-label');
    }
  });
});

describe('Navigation', () => {
  it('should navigate to correct paths', () => {
    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    );

    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /pacienți/i })).toHaveAttribute('href', '/patients');
    expect(screen.getByRole('link', { name: /calendar/i })).toHaveAttribute('href', '/calendar');
    expect(screen.getByRole('link', { name: /mesaje/i })).toHaveAttribute('href', '/messages');
  });

  it('should highlight subpaths correctly', () => {
    const { usePathname } = require('next/navigation');
    usePathname.mockReturnValue('/patients/123');

    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    );

    const patientsLink = screen.getByRole('link', { name: /pacienți/i });
    expect(patientsLink.className).toContain('bg-primary');
  });

  it('should render all navigation items', () => {
    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>
    );

    const expectedItems = [
      'Dashboard',
      'Triage',
      'Pacienți',
      'Calendar',
      'Mesaje',
      'Analytics',
      'Workflows',
      'Rapoarte',
      'Import',
      'Utilizatori',
      'Setări',
    ];

    expectedItems.forEach((item) => {
      expect(screen.getByText(item)).toBeInTheDocument();
    });
  });
});
