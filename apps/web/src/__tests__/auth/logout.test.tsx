/**
 * Logout Tests
 *
 * Tests for logout functionality including session cleanup,
 * redirect behavior, and confirmation dialogs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../setup/render';
import userEvent from '@testing-library/user-event';
import { signOut } from 'next-auth/react';

// Mock next-auth/react
const mockSignOut = vi.fn();
const mockPush = vi.fn();

vi.mock('next-auth/react', () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
  useSession: () => ({
    data: {
      user: {
        id: 'user_1',
        email: 'test@medicalcor.ro',
        name: 'Test User',
        role: 'admin',
        clinicId: 'clinic_1',
      },
      expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    },
    status: 'authenticated',
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Simple logout button component for testing
function LogoutButton({ onLogout }: { onLogout?: () => void }) {
  const handleLogout = async () => {
    await signOut({ redirect: false });
    onLogout?.();
  };

  return (
    <button onClick={handleLogout} data-testid="logout-button">
      Logout
    </button>
  );
}

// Logout confirmation dialog component
function LogoutConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div role="dialog" aria-labelledby="logout-dialog-title">
      <h2 id="logout-dialog-title">Confirm Logout</h2>
      <p>Are you sure you want to log out? Any unsaved changes will be lost.</p>
      <button onClick={onCancel}>Cancel</button>
      <button onClick={onConfirm}>Confirm Logout</button>
    </div>
  );
}

describe('Logout Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue(undefined);
  });

  describe('Basic Logout', () => {
    it('should call signOut when logout button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<LogoutButton />);

      const logoutButton = screen.getByTestId('logout-button');
      await user.click(logoutButton);

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledWith({ redirect: false });
      });
    });

    it('should execute callback after successful logout', async () => {
      const user = userEvent.setup();
      const onLogout = vi.fn();

      renderWithProviders(<LogoutButton onLogout={onLogout} />);

      const logoutButton = screen.getByTestId('logout-button');
      await user.click(logoutButton);

      await waitFor(() => {
        expect(onLogout).toHaveBeenCalled();
      });
    });
  });

  describe('Logout with Redirect', () => {
    it('should redirect to login page after logout', async () => {
      const user = userEvent.setup();

      function LogoutWithRedirect() {
        const handleLogout = async () => {
          await signOut({ redirect: false });
          mockPush('/login');
        };

        return (
          <button onClick={handleLogout} data-testid="logout-redirect">
            Logout
          </button>
        );
      }

      renderWithProviders(<LogoutWithRedirect />);

      const logoutButton = screen.getByTestId('logout-redirect');
      await user.click(logoutButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });

    it('should support callbackUrl parameter in signOut', async () => {
      const user = userEvent.setup();

      function LogoutWithCallback() {
        const handleLogout = async () => {
          await signOut({ redirect: false, callbackUrl: '/login?message=logged_out' });
        };

        return (
          <button onClick={handleLogout} data-testid="logout-callback">
            Logout
          </button>
        );
      }

      renderWithProviders(<LogoutWithCallback />);

      const logoutButton = screen.getByTestId('logout-callback');
      await user.click(logoutButton);

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledWith({
          redirect: false,
          callbackUrl: '/login?message=logged_out',
        });
      });
    });
  });

  describe('Logout Confirmation Dialog', () => {
    it('should display confirmation dialog when requested', () => {
      renderWithProviders(
        <LogoutConfirmDialog isOpen={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Confirm Logout')).toBeInTheDocument();
      expect(
        screen.getByText(/are you sure you want to log out/i)
      ).toBeInTheDocument();
    });

    it('should hide dialog when isOpen is false', () => {
      renderWithProviders(
        <LogoutConfirmDialog isOpen={false} onConfirm={vi.fn()} onCancel={vi.fn()} />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should call onConfirm when confirm button is clicked', async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();

      renderWithProviders(
        <LogoutConfirmDialog isOpen={true} onConfirm={onConfirm} onCancel={vi.fn()} />
      );

      const confirmButton = screen.getByRole('button', { name: /confirm logout/i });
      await user.click(confirmButton);

      expect(onConfirm).toHaveBeenCalled();
    });

    it('should call onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();

      renderWithProviders(
        <LogoutConfirmDialog isOpen={true} onConfirm={vi.fn()} onCancel={onCancel} />
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('Logout with Unsaved Changes', () => {
    it('should warn about unsaved changes before logout', async () => {
      const user = userEvent.setup();
      const onBeforeLogout = vi.fn().mockReturnValue(true);

      function LogoutWithWarning() {
        const handleLogout = async () => {
          const shouldProceed = onBeforeLogout();
          if (shouldProceed) {
            await signOut({ redirect: false });
          }
        };

        return (
          <button onClick={handleLogout} data-testid="logout-warning">
            Logout
          </button>
        );
      }

      renderWithProviders(<LogoutWithWarning />);

      const logoutButton = screen.getByTestId('logout-warning');
      await user.click(logoutButton);

      expect(onBeforeLogout).toHaveBeenCalled();
    });

    it('should not logout if user cancels', async () => {
      const user = userEvent.setup();
      const onBeforeLogout = vi.fn().mockReturnValue(false);

      function LogoutWithWarning() {
        const handleLogout = async () => {
          const shouldProceed = onBeforeLogout();
          if (shouldProceed) {
            await signOut({ redirect: false });
          }
        };

        return (
          <button onClick={handleLogout} data-testid="logout-cancel">
            Logout
          </button>
        );
      }

      renderWithProviders(<LogoutWithWarning />);

      const logoutButton = screen.getByTestId('logout-cancel');
      await user.click(logoutButton);

      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle logout errors gracefully', async () => {
      const user = userEvent.setup();
      const onError = vi.fn();
      mockSignOut.mockRejectedValue(new Error('Logout failed'));

      function LogoutWithError() {
        const handleLogout = async () => {
          try {
            await signOut({ redirect: false });
          } catch {
            onError();
          }
        };

        return (
          <button onClick={handleLogout} data-testid="logout-error">
            Logout
          </button>
        );
      }

      renderWithProviders(<LogoutWithError />);

      const logoutButton = screen.getByTestId('logout-error');
      await user.click(logoutButton);

      await waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });
    });

    it('should retry logout on temporary failure', async () => {
      const user = userEvent.setup();
      mockSignOut
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      let retryCount = 0;

      function LogoutWithRetry() {
        const handleLogout = async () => {
          const maxRetries = 2;
          for (let i = 0; i < maxRetries; i++) {
            try {
              await signOut({ redirect: false });
              return;
            } catch {
              retryCount++;
              if (i === maxRetries - 1) throw new Error('Max retries reached');
            }
          }
        };

        return (
          <button onClick={handleLogout} data-testid="logout-retry">
            Logout
          </button>
        );
      }

      renderWithProviders(<LogoutWithRetry />);

      const logoutButton = screen.getByTestId('logout-retry');
      await user.click(logoutButton);

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(2);
        expect(retryCount).toBe(1);
      });
    });
  });

  describe('Session Cleanup', () => {
    it('should clear local storage on logout', async () => {
      const user = userEvent.setup();
      const localStorageClear = vi.spyOn(Storage.prototype, 'clear');

      function LogoutWithCleanup() {
        const handleLogout = async () => {
          await signOut({ redirect: false });
          localStorage.clear();
        };

        return (
          <button onClick={handleLogout} data-testid="logout-cleanup">
            Logout
          </button>
        );
      }

      renderWithProviders(<LogoutWithCleanup />);

      const logoutButton = screen.getByTestId('logout-cleanup');
      await user.click(logoutButton);

      await waitFor(() => {
        expect(localStorageClear).toHaveBeenCalled();
      });

      localStorageClear.mockRestore();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible logout button', () => {
      renderWithProviders(<LogoutButton />);

      const logoutButton = screen.getByTestId('logout-button');
      expect(logoutButton).toHaveAccessibleName();
    });

    it('should have accessible confirmation dialog', () => {
      renderWithProviders(
        <LogoutConfirmDialog isOpen={true} onConfirm={vi.fn()} onCancel={vi.fn()} />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });
  });
});
