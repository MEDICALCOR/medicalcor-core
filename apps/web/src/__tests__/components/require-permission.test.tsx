import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  RequirePermission,
  RequireRole,
  AccessDenied,
  PagePermissionGate,
  usePermissions,
  LockedFeature,
} from '@/components/auth/require-permission';

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: { user: { role: 'admin' } },
    status: 'authenticated',
  })),
}));

// Mock RBAC functions
vi.mock('@/lib/auth/rbac', () => ({
  hasPermission: vi.fn((role, permission) => role === 'admin'),
  hasAllPermissions: vi.fn((role, permissions) => role === 'admin'),
  hasAnyPermission: vi.fn((role, permissions) => role === 'admin'),
  canAccessPage: vi.fn((role, pathname) => ({
    allowed: role === 'admin',
    reason: role === 'admin' ? '' : 'Nu aveți permisiunea de a accesa această pagină',
  })),
}));

describe('RequirePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render children when user has permission', () => {
    const { hasPermission } = require('@/lib/auth/rbac');
    hasPermission.mockReturnValue(true);

    render(
      <RequirePermission permission="patients:read">
        <div>Protected Content</div>
      </RequirePermission>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should not render children when user lacks permission', () => {
    const { hasPermission } = require('@/lib/auth/rbac');
    hasPermission.mockReturnValue(false);

    render(
      <RequirePermission permission="patients:read">
        <div>Protected Content</div>
      </RequirePermission>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should render fallback when permission is denied', () => {
    const { hasPermission } = require('@/lib/auth/rbac');
    hasPermission.mockReturnValue(false);

    render(
      <RequirePermission permission="patients:read" fallback={<div>Access Denied</div>}>
        <div>Protected Content</div>
      </RequirePermission>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });

  it('should hide completely when hideOnDeny is true', () => {
    const { hasPermission } = require('@/lib/auth/rbac');
    hasPermission.mockReturnValue(false);

    render(
      <RequirePermission permission="patients:read" hideOnDeny>
        <div>Protected Content</div>
      </RequirePermission>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should check all permissions when using permissions prop', () => {
    const { hasAllPermissions } = require('@/lib/auth/rbac');
    hasAllPermissions.mockReturnValue(true);

    render(
      <RequirePermission permissions={['patients:read', 'patients:edit']}>
        <div>Protected Content</div>
      </RequirePermission>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should check any permission when using anyPermission prop', () => {
    const { hasAnyPermission } = require('@/lib/auth/rbac');
    hasAnyPermission.mockReturnValue(true);

    render(
      <RequirePermission anyPermission={['patients:read', 'patients:edit']}>
        <div>Protected Content</div>
      </RequirePermission>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should check role when role prop is provided', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      data: { user: { role: 'admin' } },
      status: 'authenticated',
    });

    render(
      <RequirePermission role="admin">
        <div>Admin Content</div>
      </RequirePermission>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('should not render when role does not match', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      data: { user: { role: 'staff' } },
      status: 'authenticated',
    });

    render(
      <RequirePermission role="admin">
        <div>Admin Content</div>
      </RequirePermission>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('should render nothing while session is loading', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      data: null,
      status: 'loading',
    });

    render(
      <RequirePermission permission="patients:read">
        <div>Protected Content</div>
      </RequirePermission>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});

describe('RequireRole', () => {
  it('should render children when user has exact role', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      data: { user: { role: 'admin' } },
      status: 'authenticated',
    });

    render(
      <RequireRole role="admin">
        <div>Admin Content</div>
      </RequireRole>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('should not render when user has different role', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      data: { user: { role: 'staff' } },
      status: 'authenticated',
    });

    render(
      <RequireRole role="admin">
        <div>Admin Content</div>
      </RequireRole>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('should render when user has higher role and orHigher is true', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      data: { user: { role: 'admin' } },
      status: 'authenticated',
    });

    render(
      <RequireRole role="doctor" orHigher>
        <div>Doctor+ Content</div>
      </RequireRole>
    );

    expect(screen.getByText('Doctor+ Content')).toBeInTheDocument();
  });

  it('should not render when user has lower role even with orHigher', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      data: { user: { role: 'staff' } },
      status: 'authenticated',
    });

    render(
      <RequireRole role="admin" orHigher>
        <div>Admin+ Content</div>
      </RequireRole>
    );

    expect(screen.queryByText('Admin+ Content')).not.toBeInTheDocument();
  });

  it('should render fallback when role does not match', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      data: { user: { role: 'staff' } },
      status: 'authenticated',
    });

    render(
      <RequireRole role="admin" fallback={<div>Not Admin</div>}>
        <div>Admin Content</div>
      </RequireRole>
    );

    expect(screen.getByText('Not Admin')).toBeInTheDocument();
  });

  it('should render nothing while loading', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      data: null,
      status: 'loading',
    });

    render(
      <RequireRole role="admin">
        <div>Admin Content</div>
      </RequireRole>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });
});

describe('AccessDenied', () => {
  it('should render access denied message', () => {
    render(<AccessDenied />);

    expect(screen.getByText('Acces Interzis')).toBeInTheDocument();
    expect(screen.getByText('Nu aveți permisiunea de a accesa această pagină')).toBeInTheDocument();
  });

  it('should render custom message', () => {
    render(<AccessDenied message="Custom access denied message" />);

    expect(screen.getByText('Custom access denied message')).toBeInTheDocument();
  });

  it('should show back button by default', () => {
    render(<AccessDenied />);

    expect(screen.getByRole('button', { name: 'Înapoi' })).toBeInTheDocument();
  });

  it('should hide back button when showBackButton is false', () => {
    render(<AccessDenied showBackButton={false} />);

    expect(screen.queryByRole('button', { name: 'Înapoi' })).not.toBeInTheDocument();
  });

  it('should call window.history.back when back button is clicked', async () => {
    const user = userEvent.setup();
    const mockBack = vi.fn();
    window.history.back = mockBack;

    render(<AccessDenied />);

    await user.click(screen.getByRole('button', { name: 'Înapoi' }));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('PagePermissionGate', () => {
  it('should render children when user has page access', () => {
    const { canAccessPage } = require('@/lib/auth/rbac');
    canAccessPage.mockReturnValue({ allowed: true, reason: '' });

    render(
      <PagePermissionGate pathname="/patients">
        <div>Page Content</div>
      </PagePermissionGate>
    );

    expect(screen.getByText('Page Content')).toBeInTheDocument();
  });

  it('should render access denied when user lacks page access', () => {
    const { canAccessPage } = require('@/lib/auth/rbac');
    canAccessPage.mockReturnValue({
      allowed: false,
      reason: 'Insufficient permissions',
    });

    render(
      <PagePermissionGate pathname="/admin">
        <div>Admin Page</div>
      </PagePermissionGate>
    );

    expect(screen.queryByText('Admin Page')).not.toBeInTheDocument();
    expect(screen.getByText('Acces Interzis')).toBeInTheDocument();
  });

  it('should show loading spinner while session is loading', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      data: null,
      status: 'loading',
    });

    const { container } = render(
      <PagePermissionGate pathname="/patients">
        <div>Page Content</div>
      </PagePermissionGate>
    );

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});

describe('usePermissions', () => {
  it('should return permission check functions', () => {
    function TestComponent() {
      const { can, canAll, canAny } = usePermissions();
      return (
        <div>
          <div>{can('patients:read') ? 'Can Read' : 'Cannot Read'}</div>
          <div>{canAll(['patients:read', 'patients:edit']) ? 'Can All' : 'Cannot All'}</div>
          <div>{canAny(['patients:read', 'patients:edit']) ? 'Can Any' : 'Cannot Any'}</div>
        </div>
      );
    }

    const { hasPermission, hasAllPermissions, hasAnyPermission } = require('@/lib/auth/rbac');
    hasPermission.mockReturnValue(true);
    hasAllPermissions.mockReturnValue(true);
    hasAnyPermission.mockReturnValue(true);

    render(<TestComponent />);

    expect(screen.getByText('Can Read')).toBeInTheDocument();
    expect(screen.getByText('Can All')).toBeInTheDocument();
    expect(screen.getByText('Can Any')).toBeInTheDocument();
  });

  it('should return current user role', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      data: { user: { role: 'doctor' } },
      status: 'authenticated',
    });

    function TestComponent() {
      const { role } = usePermissions();
      return <div>Role: {role}</div>;
    }

    render(<TestComponent />);

    expect(screen.getByText('Role: doctor')).toBeInTheDocument();
  });

  it('should return loading state', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      data: null,
      status: 'loading',
    });

    function TestComponent() {
      const { isLoading } = usePermissions();
      return <div>{isLoading ? 'Loading' : 'Not Loading'}</div>;
    }

    render(<TestComponent />);

    expect(screen.getByText('Loading')).toBeInTheDocument();
  });

  it('should return authentication state', () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      data: { user: { role: 'admin' } },
      status: 'authenticated',
    });

    function TestComponent() {
      const { isAuthenticated } = usePermissions();
      return <div>{isAuthenticated ? 'Authenticated' : 'Not Authenticated'}</div>;
    }

    render(<TestComponent />);

    expect(screen.getByText('Authenticated')).toBeInTheDocument();
  });
});

describe('LockedFeature', () => {
  it('should render children when user has permission', () => {
    const { hasPermission } = require('@/lib/auth/rbac');
    hasPermission.mockReturnValue(true);

    render(
      <LockedFeature permission="billing:create">
        <button>Create Invoice</button>
      </LockedFeature>
    );

    expect(screen.getByRole('button', { name: 'Create Invoice' })).toBeInTheDocument();
  });

  it('should render locked state when user lacks permission', () => {
    const { hasPermission } = require('@/lib/auth/rbac');
    hasPermission.mockReturnValue(false);

    const { container } = render(
      <LockedFeature permission="billing:create">
        <button>Create Invoice</button>
      </LockedFeature>
    );

    expect(container.querySelector('.opacity-50')).toBeInTheDocument();
    expect(container.querySelector('.cursor-not-allowed')).toBeInTheDocument();
  });

  it('should show custom tooltip', () => {
    const { hasPermission } = require('@/lib/auth/rbac');
    hasPermission.mockReturnValue(false);

    const { container } = render(
      <LockedFeature permission="billing:create" tooltip="Premium feature">
        <button>Create Invoice</button>
      </LockedFeature>
    );

    const lockedDiv = container.querySelector('[title="Premium feature"]');
    expect(lockedDiv).toBeInTheDocument();
  });
});
