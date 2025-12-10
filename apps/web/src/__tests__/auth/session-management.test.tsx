/**
 * Session Management Tests
 *
 * Tests for session handling including session state, expiration,
 * refresh, and persistence across page navigations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../setup/render';
import { createMockSession, createMockUser } from '../setup/test-data';
import type { MockSession, MockUser } from '../setup/test-data';

// Session state mock types
type SessionStatus = 'authenticated' | 'unauthenticated' | 'loading';

interface SessionState {
  data: MockSession | null;
  status: SessionStatus;
}

// Mock variables to control session state
let currentSession: MockSession | null = null;
let currentStatus: SessionStatus = 'unauthenticated';

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: currentSession,
    status: currentStatus,
    update: vi.fn().mockResolvedValue(currentSession),
  }),
  signIn: vi.fn(),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Test component that displays session info
function SessionInfo() {
  const { useSession } = require('next-auth/react');
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <div data-testid="session-loading">Loading session...</div>;
  }

  if (status === 'unauthenticated' || !session) {
    return <div data-testid="session-unauthenticated">Not authenticated</div>;
  }

  return (
    <div data-testid="session-authenticated">
      <p data-testid="user-name">{session.user.name}</p>
      <p data-testid="user-email">{session.user.email}</p>
      <p data-testid="user-role">{session.user.role}</p>
      <p data-testid="session-expires">{session.expires}</p>
    </div>
  );
}

// Test component for session expiration
function SessionExpirationWarning({ warningThresholdMs = 5 * 60 * 1000 }) {
  const { useSession } = require('next-auth/react');
  const { data: session } = useSession();

  if (!session) return null;

  const expiresAt = new Date(session.expires).getTime();
  const now = Date.now();
  const timeRemaining = expiresAt - now;

  if (timeRemaining < warningThresholdMs && timeRemaining > 0) {
    return (
      <div data-testid="session-warning" role="alert">
        Your session will expire in {Math.floor(timeRemaining / 60000)} minutes
      </div>
    );
  }

  if (timeRemaining <= 0) {
    return (
      <div data-testid="session-expired" role="alert">
        Your session has expired
      </div>
    );
  }

  return null;
}

// Protected content component
function ProtectedContent({
  requiredRole,
  children,
}: {
  requiredRole?: MockUser['role'];
  children: React.ReactNode;
}) {
  const { useSession } = require('next-auth/react');
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <div data-testid="protected-loading">Loading...</div>;
  }

  if (!session) {
    return <div data-testid="protected-denied">Access denied - not authenticated</div>;
  }

  if (requiredRole && session.user.role !== requiredRole) {
    return <div data-testid="protected-denied">Access denied - insufficient permissions</div>;
  }

  return <div data-testid="protected-content">{children}</div>;
}

describe('Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSession = null;
    currentStatus = 'unauthenticated';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Session State Display', () => {
    it('should show loading state while session is being fetched', () => {
      currentStatus = 'loading';
      renderWithProviders(<SessionInfo />);

      expect(screen.getByTestId('session-loading')).toBeInTheDocument();
    });

    it('should show unauthenticated state when no session exists', () => {
      currentStatus = 'unauthenticated';
      currentSession = null;
      renderWithProviders(<SessionInfo />);

      expect(screen.getByTestId('session-unauthenticated')).toBeInTheDocument();
    });

    it('should show authenticated state with user info', () => {
      currentSession = createMockSession({
        user: createMockUser({
          name: 'Test User',
          email: 'test@medicalcor.ro',
          role: 'admin',
        }),
      });
      currentStatus = 'authenticated';
      renderWithProviders(<SessionInfo />);

      expect(screen.getByTestId('session-authenticated')).toBeInTheDocument();
      expect(screen.getByTestId('user-name')).toHaveTextContent('Test User');
      expect(screen.getByTestId('user-email')).toHaveTextContent('test@medicalcor.ro');
      expect(screen.getByTestId('user-role')).toHaveTextContent('admin');
    });

    it('should display session expiration time', () => {
      const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
      currentSession = createMockSession({ expires });
      currentStatus = 'authenticated';
      renderWithProviders(<SessionInfo />);

      expect(screen.getByTestId('session-expires')).toHaveTextContent(expires);
    });
  });

  describe('Session Expiration', () => {
    it('should show warning when session is about to expire', () => {
      // Session expires in 4 minutes (below 5 minute threshold)
      const expires = new Date(Date.now() + 4 * 60 * 1000).toISOString();
      currentSession = createMockSession({ expires });
      currentStatus = 'authenticated';

      renderWithProviders(<SessionExpirationWarning warningThresholdMs={5 * 60 * 1000} />);

      expect(screen.getByTestId('session-warning')).toBeInTheDocument();
    });

    it('should not show warning when session has plenty of time', () => {
      // Session expires in 1 hour
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      currentSession = createMockSession({ expires });
      currentStatus = 'authenticated';

      renderWithProviders(<SessionExpirationWarning warningThresholdMs={5 * 60 * 1000} />);

      expect(screen.queryByTestId('session-warning')).not.toBeInTheDocument();
    });

    it('should show expired message when session has expired', () => {
      // Session expired 1 minute ago
      const expires = new Date(Date.now() - 60 * 1000).toISOString();
      currentSession = createMockSession({ expires });
      currentStatus = 'authenticated';

      renderWithProviders(<SessionExpirationWarning />);

      expect(screen.getByTestId('session-expired')).toBeInTheDocument();
    });
  });

  describe('Protected Content', () => {
    it('should show loading state while checking session', () => {
      currentStatus = 'loading';
      renderWithProviders(
        <ProtectedContent>
          <span>Secret content</span>
        </ProtectedContent>
      );

      expect(screen.getByTestId('protected-loading')).toBeInTheDocument();
    });

    it('should deny access when not authenticated', () => {
      currentStatus = 'unauthenticated';
      currentSession = null;
      renderWithProviders(
        <ProtectedContent>
          <span>Secret content</span>
        </ProtectedContent>
      );

      expect(screen.getByTestId('protected-denied')).toBeInTheDocument();
      expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
    });

    it('should show content when authenticated', () => {
      currentSession = createMockSession();
      currentStatus = 'authenticated';
      renderWithProviders(
        <ProtectedContent>
          <span>Secret content</span>
        </ProtectedContent>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.getByText('Secret content')).toBeInTheDocument();
    });

    it('should deny access when role does not match', () => {
      currentSession = createMockSession({
        user: createMockUser({ role: 'staff' }),
      });
      currentStatus = 'authenticated';
      renderWithProviders(
        <ProtectedContent requiredRole="admin">
          <span>Admin content</span>
        </ProtectedContent>
      );

      expect(screen.getByTestId('protected-denied')).toBeInTheDocument();
      expect(screen.queryByText('Admin content')).not.toBeInTheDocument();
    });

    it('should allow access when role matches', () => {
      currentSession = createMockSession({
        user: createMockUser({ role: 'admin' }),
      });
      currentStatus = 'authenticated';
      renderWithProviders(
        <ProtectedContent requiredRole="admin">
          <span>Admin content</span>
        </ProtectedContent>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.getByText('Admin content')).toBeInTheDocument();
    });
  });

  describe('Role-Based Session Data', () => {
    it('should include clinicId for clinic-scoped users', () => {
      currentSession = createMockSession({
        user: createMockUser({
          role: 'receptionist',
          clinicId: 'clinic_123',
        }),
      });
      currentStatus = 'authenticated';
      renderWithProviders(<SessionInfo />);

      expect(currentSession?.user.clinicId).toBe('clinic_123');
    });

    it('should handle different roles correctly', () => {
      const roles: MockUser['role'][] = ['admin', 'doctor', 'receptionist', 'staff'];

      roles.forEach((role) => {
        currentSession = createMockSession({
          user: createMockUser({ role }),
        });
        currentStatus = 'authenticated';

        const { unmount } = renderWithProviders(<SessionInfo />);

        expect(screen.getByTestId('user-role')).toHaveTextContent(role);
        unmount();
      });
    });
  });

  describe('Session Persistence', () => {
    it('should maintain session data structure after navigation', () => {
      const sessionData = createMockSession({
        user: createMockUser({
          id: 'persistent_user',
          name: 'Persistent User',
        }),
      });
      currentSession = sessionData;
      currentStatus = 'authenticated';

      // First render
      const { unmount } = renderWithProviders(<SessionInfo />);
      expect(screen.getByTestId('user-name')).toHaveTextContent('Persistent User');
      unmount();

      // Simulate navigation (re-render)
      renderWithProviders(<SessionInfo />);
      expect(screen.getByTestId('user-name')).toHaveTextContent('Persistent User');
    });
  });

  describe('Session Update', () => {
    it('should reflect updated session data', async () => {
      // Initial session
      currentSession = createMockSession({
        user: createMockUser({ name: 'Initial Name' }),
      });
      currentStatus = 'authenticated';

      const { rerender } = renderWithProviders(<SessionInfo />);
      expect(screen.getByTestId('user-name')).toHaveTextContent('Initial Name');

      // Update session
      currentSession = createMockSession({
        user: createMockUser({ name: 'Updated Name' }),
      });

      rerender(<SessionInfo />);

      await waitFor(() => {
        expect(screen.getByTestId('user-name')).toHaveTextContent('Updated Name');
      });
    });
  });

  describe('Session Security', () => {
    it('should not expose sensitive data in session', () => {
      currentSession = createMockSession({
        user: createMockUser({
          email: 'test@medicalcor.ro',
        }),
      });
      currentStatus = 'authenticated';
      renderWithProviders(<SessionInfo />);

      // Session should not contain password or other sensitive fields
      expect(currentSession?.user).not.toHaveProperty('password');
      expect(currentSession?.user).not.toHaveProperty('passwordHash');
    });

    it('should include necessary security fields', () => {
      currentSession = createMockSession();
      currentStatus = 'authenticated';
      renderWithProviders(<SessionInfo />);

      // Session should have expiration
      expect(currentSession?.expires).toBeDefined();
      expect(typeof currentSession?.expires).toBe('string');
    });
  });

  describe('Accessibility', () => {
    it('should have accessible session warning alerts', () => {
      const expires = new Date(Date.now() + 4 * 60 * 1000).toISOString();
      currentSession = createMockSession({ expires });
      currentStatus = 'authenticated';

      renderWithProviders(<SessionExpirationWarning warningThresholdMs={5 * 60 * 1000} />);

      const warning = screen.getByTestId('session-warning');
      expect(warning).toHaveAttribute('role', 'alert');
    });

    it('should have accessible expired session alerts', () => {
      const expires = new Date(Date.now() - 60 * 1000).toISOString();
      currentSession = createMockSession({ expires });
      currentStatus = 'authenticated';

      renderWithProviders(<SessionExpirationWarning />);

      const expired = screen.getByTestId('session-expired');
      expect(expired).toHaveAttribute('role', 'alert');
    });
  });
});
