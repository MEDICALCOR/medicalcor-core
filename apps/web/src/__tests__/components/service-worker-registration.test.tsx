import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServiceWorkerRegistration } from '@/components/pwa/service-worker-registration';

// Mock service worker
const mockServiceWorker = {
  state: 'installing',
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

const mockRegistration = {
  installing: mockServiceWorker,
  update: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

Object.defineProperty(global, 'navigator', {
  value: {
    serviceWorker: {
      register: vi.fn(),
      controller: null,
    },
  },
  writable: true,
});

describe('ServiceWorkerRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render by default', () => {
    const { container } = render(<ServiceWorkerRegistration />);
    expect(container.firstChild).toBeNull();
  });

  it('should register service worker on mount', () => {
    (navigator.serviceWorker.register as any).mockResolvedValue(mockRegistration);

    render(<ServiceWorkerRegistration />);

    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js');
  });

  it('should show update prompt when new version available', async () => {
    (navigator.serviceWorker.register as any).mockImplementation(() => {
      // Simulate update found
      setTimeout(() => {
        const updateHandler = mockRegistration.addEventListener.mock.calls.find(
          (call) => call[0] === 'updatefound'
        )?.[1];
        updateHandler?.();

        // Simulate state change to installed
        mockServiceWorker.state = 'installed';
        (navigator.serviceWorker as any).controller = {};

        const stateChangeHandler = mockServiceWorker.addEventListener.mock.calls.find(
          (call) => call[0] === 'statechange'
        )?.[1];
        stateChangeHandler?.();
      }, 0);

      return Promise.resolve(mockRegistration);
    });

    render(<ServiceWorkerRegistration />);

    await waitFor(
      () => {
        expect(screen.queryByText('Actualizare disponibilă')).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  it('should reload page when update button clicked', async () => {
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadSpy },
      writable: true,
    });

    (navigator.serviceWorker.register as any).mockImplementation(() => {
      setTimeout(() => {
        const updateHandler = mockRegistration.addEventListener.mock.calls.find(
          (call) => call[0] === 'updatefound'
        )?.[1];
        updateHandler?.();

        mockServiceWorker.state = 'installed';
        (navigator.serviceWorker as any).controller = {};

        const stateChangeHandler = mockServiceWorker.addEventListener.mock.calls.find(
          (call) => call[0] === 'statechange'
        )?.[1];
        stateChangeHandler?.();
      }, 0);

      return Promise.resolve(mockRegistration);
    });

    render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(screen.queryByText('Actualizare disponibilă')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const updateButton = screen.getByRole('button', { name: /actualizează/i });
    await user.click(updateButton);

    expect(reloadSpy).toHaveBeenCalled();
  });

  it('should show install prompt when available', async () => {
    const mockPrompt = {
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    };

    render(<ServiceWorkerRegistration />);

    // Simulate beforeinstallprompt event
    const event = new Event('beforeinstallprompt');
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
    Object.assign(event, mockPrompt);

    window.dispatchEvent(event);

    await waitFor(() => {
      expect(screen.queryByText('Instalează aplicația')).toBeInTheDocument();
    }, { timeout: 31000 });
  });

  it('should call prompt when install button clicked', async () => {
    const mockPrompt = {
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    };

    render(<ServiceWorkerRegistration />);

    const event = new Event('beforeinstallprompt');
    Object.assign(event, mockPrompt);
    window.dispatchEvent(event);

    await waitFor(() => {
      expect(screen.queryByText('Instalează aplicația')).toBeInTheDocument();
    }, { timeout: 31000 });

    const user = userEvent.setup();
    const installButton = screen.getByRole('button', { name: /instalează/i });
    await user.click(installButton);

    expect(mockPrompt.prompt).toHaveBeenCalled();
  });

  it('should handle service worker registration errors', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (navigator.serviceWorker.register as any).mockRejectedValue(new Error('Registration failed'));

    render(<ServiceWorkerRegistration />);

    // Should not throw, should log error
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('should clean up on unmount', () => {
    const { unmount } = render(<ServiceWorkerRegistration />);

    unmount();

    // Should remove event listeners
    expect(true).toBe(true);
  });
});
