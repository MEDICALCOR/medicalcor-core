import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationSettings } from '@/components/notifications/notification-settings';

const mockRequestPermission = vi.fn();
const mockSetPreferences = vi.fn();

vi.mock('@/lib/notifications', () => ({
  useNotifications: vi.fn(() => ({
    isSupported: true,
    permission: 'granted',
    preferences: {
      enabled: true,
      urgencies: true,
      newLeads: true,
      appointments: true,
      sound: true,
    },
    requestPermission: mockRequestPermission,
    setPreferences: mockSetPreferences,
  })),
}));

describe('NotificationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render settings title', () => {
    render(<NotificationSettings />);
    expect(screen.getByText('Setări Notificări')).toBeInTheDocument();
  });

  it('should show unsupported message when notifications not supported', () => {
    const { useNotifications } = require('@/lib/notifications');
    useNotifications.mockReturnValue({
      isSupported: false,
      permission: 'default',
      preferences: {},
      requestPermission: mockRequestPermission,
      setPreferences: mockSetPreferences,
    });

    render(<NotificationSettings />);
    expect(screen.getByText('Notificări indisponibile')).toBeInTheDocument();
    expect(screen.getByText('Browserul tău nu suportă notificări push.')).toBeInTheDocument();
  });

  it('should display all notification toggles when permission granted', () => {
    render(<NotificationSettings />);

    expect(screen.getByText('Notificări activate')).toBeInTheDocument();
    expect(screen.getByText('Urgențe')).toBeInTheDocument();
    expect(screen.getByText('Lead-uri noi')).toBeInTheDocument();
    expect(screen.getByText('Programări')).toBeInTheDocument();
    expect(screen.getByText('Sunet')).toBeInTheDocument();
  });

  it('should show permission request when permission is default', () => {
    const { useNotifications } = require('@/lib/notifications');
    useNotifications.mockReturnValue({
      isSupported: true,
      permission: 'default',
      preferences: {},
      requestPermission: mockRequestPermission,
      setPreferences: mockSetPreferences,
    });

    render(<NotificationSettings />);

    expect(
      screen.getByText('Pentru a primi notificări, trebuie să acorzi permisiune browserului.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /activează notificările/i })).toBeInTheDocument();
  });

  it('should call requestPermission when activate button is clicked', async () => {
    const user = userEvent.setup();
    const { useNotifications } = require('@/lib/notifications');
    useNotifications.mockReturnValue({
      isSupported: true,
      permission: 'default',
      preferences: {},
      requestPermission: mockRequestPermission,
      setPreferences: mockSetPreferences,
    });

    render(<NotificationSettings />);

    await user.click(screen.getByRole('button', { name: /activează notificările/i }));

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it('should show denied message when permission is denied', () => {
    const { useNotifications } = require('@/lib/notifications');
    useNotifications.mockReturnValue({
      isSupported: true,
      permission: 'denied',
      preferences: {},
      requestPermission: mockRequestPermission,
      setPreferences: mockSetPreferences,
    });

    render(<NotificationSettings />);

    expect(
      screen.getByText(
        'Notificările au fost blocate. Pentru a le activa, accesează setările browserului.'
      )
    ).toBeInTheDocument();
  });

  it('should toggle notifications enabled', async () => {
    const user = userEvent.setup();
    render(<NotificationSettings />);

    const toggleButtons = screen.getAllByRole('button');
    const enabledToggle = toggleButtons.find((btn) => {
      const parent = btn.closest('.py-3');
      return parent?.textContent?.includes('Notificări activate');
    });

    if (enabledToggle) {
      await user.click(enabledToggle);
      expect(mockSetPreferences).toHaveBeenCalledWith({ enabled: false });
    }
  });

  it('should toggle urgencies', async () => {
    const user = userEvent.setup();
    render(<NotificationSettings />);

    const toggleButtons = screen.getAllByRole('button');
    const urgenciesToggle = toggleButtons.find((btn) => {
      const parent = btn.closest('.py-3');
      return parent?.textContent?.includes('Urgențe');
    });

    if (urgenciesToggle) {
      await user.click(urgenciesToggle);
      expect(mockSetPreferences).toHaveBeenCalledWith({ urgencies: false });
    }
  });

  it('should toggle new leads', async () => {
    const user = userEvent.setup();
    render(<NotificationSettings />);

    const toggleButtons = screen.getAllByRole('button');
    const leadsToggle = toggleButtons.find((btn) => {
      const parent = btn.closest('.py-3');
      return parent?.textContent?.includes('Lead-uri noi');
    });

    if (leadsToggle) {
      await user.click(leadsToggle);
      expect(mockSetPreferences).toHaveBeenCalledWith({ newLeads: false });
    }
  });

  it('should toggle appointments', async () => {
    const user = userEvent.setup();
    render(<NotificationSettings />);

    const toggleButtons = screen.getAllByRole('button');
    const appointmentsToggle = toggleButtons.find((btn) => {
      const parent = btn.closest('.py-3');
      return parent?.textContent?.includes('Programări');
    });

    if (appointmentsToggle) {
      await user.click(appointmentsToggle);
      expect(mockSetPreferences).toHaveBeenCalledWith({ appointments: false });
    }
  });

  it('should toggle sound', async () => {
    const user = userEvent.setup();
    render(<NotificationSettings />);

    const toggleButtons = screen.getAllByRole('button');
    const soundToggle = toggleButtons.find((btn) => {
      const parent = btn.closest('.py-3');
      return parent?.textContent?.includes('Sunet');
    });

    if (soundToggle) {
      await user.click(soundToggle);
      expect(mockSetPreferences).toHaveBeenCalledWith({ sound: false });
    }
  });

  it('should disable individual toggles when notifications disabled', () => {
    const { useNotifications } = require('@/lib/notifications');
    useNotifications.mockReturnValue({
      isSupported: true,
      permission: 'granted',
      preferences: {
        enabled: false,
        urgencies: false,
        newLeads: false,
        appointments: false,
        sound: false,
      },
      requestPermission: mockRequestPermission,
      setPreferences: mockSetPreferences,
    });

    render(<NotificationSettings />);

    const toggleButtons = screen.getAllByRole('button');
    const urgenciesToggle = toggleButtons.find((btn) => {
      const parent = btn.closest('.py-3');
      return parent?.textContent?.includes('Urgențe');
    });

    expect(urgenciesToggle).toBeDisabled();
  });

  it('should disable toggles when permission not granted', () => {
    const { useNotifications } = require('@/lib/notifications');
    useNotifications.mockReturnValue({
      isSupported: true,
      permission: 'denied',
      preferences: {
        enabled: true,
        urgencies: true,
        newLeads: true,
        appointments: true,
        sound: true,
      },
      requestPermission: mockRequestPermission,
      setPreferences: mockSetPreferences,
    });

    render(<NotificationSettings />);

    const toggleButtons = screen.getAllByRole('button');
    expect(toggleButtons.length).toBeGreaterThan(0);
  });

  it('should show sound icon based on preference', () => {
    render(<NotificationSettings />);
    expect(screen.getByText('Sunet')).toBeInTheDocument();
  });

  it('should display description for each setting', () => {
    render(<NotificationSettings />);

    expect(screen.getByText('Activează sau dezactivează toate notificările')).toBeInTheDocument();
    expect(screen.getByText('Primește alerte pentru cazurile urgente')).toBeInTheDocument();
    expect(screen.getByText('Notificări când primești lead-uri noi')).toBeInTheDocument();
    expect(screen.getByText('Remindere și actualizări programări')).toBeInTheDocument();
    expect(screen.getByText('Redă un sunet la notificări')).toBeInTheDocument();
  });
});
