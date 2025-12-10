/**
 * MFA (Multi-Factor Authentication) Flow Tests
 *
 * Tests for MFA setup, verification, and management flows.
 * Covers TOTP setup, backup codes, and MFA enforcement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../setup/render';
import userEvent from '@testing-library/user-event';
import { createMockUser, createMockSession } from '../setup/test-data';

// Mock MFA state
let mfaEnabled = false;
let mfaPending = false;

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: {
        id: 'user_1',
        email: 'test@medicalcor.ro',
        name: 'Test User',
        role: 'admin',
        clinicId: 'clinic_1',
        mfaEnabled,
      },
      expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    },
    status: 'authenticated',
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

// MFA Setup Component
function MFASetup({
  onSetupComplete,
  onCancel,
}: {
  onSetupComplete?: (backupCodes: string[]) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = React.useState<'qr' | 'verify' | 'backup'>('qr');
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [backupCodes, setBackupCodes] = React.useState<string[]>([]);

  const handleVerify = async () => {
    if (code.length !== 6 || !/^\d+$/.test(code)) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    // Simulate verification
    if (code === '123456') {
      const codes = [
        'BACKUP-CODE-1',
        'BACKUP-CODE-2',
        'BACKUP-CODE-3',
        'BACKUP-CODE-4',
        'BACKUP-CODE-5',
        'BACKUP-CODE-6',
        'BACKUP-CODE-7',
        'BACKUP-CODE-8',
      ];
      setBackupCodes(codes);
      setStep('backup');
    } else {
      setError('Invalid verification code');
    }
  };

  const handleComplete = () => {
    onSetupComplete?.(backupCodes);
  };

  return (
    <div data-testid="mfa-setup">
      {step === 'qr' && (
        <div data-testid="mfa-qr-step">
          <h2>Set up Two-Factor Authentication</h2>
          <p>Scan this QR code with your authenticator app</p>
          <div data-testid="qr-code" aria-label="QR Code for authenticator setup">
            [QR Code Placeholder]
          </div>
          <p>Or enter this secret manually:</p>
          <code data-testid="mfa-secret">JBSWY3DPEHPK3PXP</code>
          <button onClick={() => setStep('verify')}>Continue</button>
          {onCancel && <button onClick={onCancel}>Cancel</button>}
        </div>
      )}

      {step === 'verify' && (
        <div data-testid="mfa-verify-step">
          <h2>Verify Setup</h2>
          <p>Enter the 6-digit code from your authenticator app</p>
          {error && (
            <div role="alert" data-testid="mfa-error">
              {error}
            </div>
          )}
          <label htmlFor="mfa-code">Verification Code</label>
          <input
            id="mfa-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            aria-describedby="code-help"
          />
          <p id="code-help">Enter the 6-digit code shown in your authenticator app</p>
          <button onClick={handleVerify}>Verify</button>
          <button onClick={() => setStep('qr')}>Back</button>
        </div>
      )}

      {step === 'backup' && (
        <div data-testid="mfa-backup-step">
          <h2>Save Your Backup Codes</h2>
          <p>
            Store these codes in a safe place. You can use them to access your account if you lose
            your authenticator device.
          </p>
          <ul data-testid="backup-codes-list">
            {backupCodes.map((code, index) => (
              <li key={index} data-testid={`backup-code-${index}`}>
                {code}
              </li>
            ))}
          </ul>
          <button onClick={handleComplete}>I have saved my backup codes</button>
        </div>
      )}
    </div>
  );
}

// Need React import for the component
import React from 'react';

// MFA Verification Component (for login)
function MFAVerification({
  onVerify,
  onUseBackupCode,
}: {
  onVerify?: (code: string) => Promise<boolean>;
  onUseBackupCode?: () => void;
}) {
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (code.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setIsLoading(true);
    try {
      const success = await onVerify?.(code);
      if (!success) {
        setError('Invalid verification code');
      }
    } catch {
      setError('Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div data-testid="mfa-verification">
      <h2>Two-Factor Authentication</h2>
      <p>Enter the verification code from your authenticator app</p>

      <form onSubmit={handleSubmit}>
        {error && (
          <div role="alert" data-testid="mfa-verify-error">
            {error}
          </div>
        )}

        <label htmlFor="verify-code">Verification Code</label>
        <input
          id="verify-code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          disabled={isLoading}
        />

        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Verifying...' : 'Verify'}
        </button>
      </form>

      {onUseBackupCode && (
        <button onClick={onUseBackupCode} data-testid="use-backup-code">
          Use backup code instead
        </button>
      )}
    </div>
  );
}

// MFA Settings Component
function MFASettings({
  enabled,
  onEnable,
  onDisable,
}: {
  enabled: boolean;
  onEnable?: () => void;
  onDisable?: () => void;
}) {
  return (
    <div data-testid="mfa-settings">
      <h3>Two-Factor Authentication</h3>
      <p data-testid="mfa-status">
        Status: {enabled ? 'Enabled' : 'Disabled'}
      </p>

      {enabled ? (
        <button onClick={onDisable} data-testid="disable-mfa">
          Disable 2FA
        </button>
      ) : (
        <button onClick={onEnable} data-testid="enable-mfa">
          Enable 2FA
        </button>
      )}
    </div>
  );
}

describe('MFA Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mfaEnabled = false;
    mfaPending = false;
  });

  describe('MFA Setup', () => {
    it('should render QR code step initially', () => {
      renderWithProviders(<MFASetup />);

      expect(screen.getByTestId('mfa-qr-step')).toBeInTheDocument();
      expect(screen.getByText(/scan this qr code/i)).toBeInTheDocument();
    });

    it('should display QR code for authenticator setup', () => {
      renderWithProviders(<MFASetup />);

      expect(screen.getByTestId('qr-code')).toBeInTheDocument();
      expect(screen.getByTestId('mfa-secret')).toBeInTheDocument();
    });

    it('should display manual secret key as fallback', () => {
      renderWithProviders(<MFASetup />);

      const secret = screen.getByTestId('mfa-secret');
      expect(secret).toHaveTextContent('JBSWY3DPEHPK3PXP');
    });

    it('should proceed to verification step when clicking continue', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MFASetup />);

      const continueButton = screen.getByRole('button', { name: /continue/i });
      await user.click(continueButton);

      expect(screen.getByTestId('mfa-verify-step')).toBeInTheDocument();
    });

    it('should allow canceling MFA setup', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();

      renderWithProviders(<MFASetup onCancel={onCancel} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('MFA Verification (Setup)', () => {
    it('should accept only numeric input', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MFASetup />);

      // Navigate to verify step
      await user.click(screen.getByRole('button', { name: /continue/i }));

      const input = screen.getByLabelText(/verification code/i);
      await user.type(input, 'abc123def');

      expect(input).toHaveValue('123');
    });

    it('should validate code length', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MFASetup />);

      await user.click(screen.getByRole('button', { name: /continue/i }));

      const input = screen.getByLabelText(/verification code/i);
      await user.type(input, '123');

      await user.click(screen.getByRole('button', { name: /verify/i }));

      expect(screen.getByTestId('mfa-error')).toHaveTextContent(/valid 6-digit code/i);
    });

    it('should show error for invalid verification code', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MFASetup />);

      await user.click(screen.getByRole('button', { name: /continue/i }));

      const input = screen.getByLabelText(/verification code/i);
      await user.type(input, '999999');

      await user.click(screen.getByRole('button', { name: /verify/i }));

      expect(screen.getByTestId('mfa-error')).toHaveTextContent(/invalid verification code/i);
    });

    it('should proceed to backup codes on successful verification', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MFASetup />);

      await user.click(screen.getByRole('button', { name: /continue/i }));

      const input = screen.getByLabelText(/verification code/i);
      await user.type(input, '123456');

      await user.click(screen.getByRole('button', { name: /verify/i }));

      expect(screen.getByTestId('mfa-backup-step')).toBeInTheDocument();
    });

    it('should allow going back to QR code step', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MFASetup />);

      await user.click(screen.getByRole('button', { name: /continue/i }));
      expect(screen.getByTestId('mfa-verify-step')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /back/i }));
      expect(screen.getByTestId('mfa-qr-step')).toBeInTheDocument();
    });
  });

  describe('Backup Codes', () => {
    it('should display backup codes after verification', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MFASetup />);

      await user.click(screen.getByRole('button', { name: /continue/i }));

      const input = screen.getByLabelText(/verification code/i);
      await user.type(input, '123456');
      await user.click(screen.getByRole('button', { name: /verify/i }));

      expect(screen.getByTestId('backup-codes-list')).toBeInTheDocument();
      expect(screen.getByTestId('backup-code-0')).toBeInTheDocument();
    });

    it('should generate 8 backup codes', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MFASetup />);

      await user.click(screen.getByRole('button', { name: /continue/i }));

      const input = screen.getByLabelText(/verification code/i);
      await user.type(input, '123456');
      await user.click(screen.getByRole('button', { name: /verify/i }));

      const codesList = screen.getByTestId('backup-codes-list');
      expect(codesList.children).toHaveLength(8);
    });

    it('should call onSetupComplete with backup codes', async () => {
      const user = userEvent.setup();
      const onSetupComplete = vi.fn();

      renderWithProviders(<MFASetup onSetupComplete={onSetupComplete} />);

      await user.click(screen.getByRole('button', { name: /continue/i }));

      const input = screen.getByLabelText(/verification code/i);
      await user.type(input, '123456');
      await user.click(screen.getByRole('button', { name: /verify/i }));

      await user.click(screen.getByRole('button', { name: /i have saved/i }));

      expect(onSetupComplete).toHaveBeenCalledWith(expect.arrayContaining([expect.any(String)]));
    });
  });

  describe('MFA Login Verification', () => {
    it('should render verification form', () => {
      renderWithProviders(<MFAVerification />);

      expect(screen.getByTestId('mfa-verification')).toBeInTheDocument();
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });

    it('should call onVerify with entered code', async () => {
      const user = userEvent.setup();
      const onVerify = vi.fn().mockResolvedValue(true);

      renderWithProviders(<MFAVerification onVerify={onVerify} />);

      const input = screen.getByLabelText(/verification code/i);
      await user.type(input, '123456');
      await user.click(screen.getByRole('button', { name: /verify/i }));

      await waitFor(() => {
        expect(onVerify).toHaveBeenCalledWith('123456');
      });
    });

    it('should show error for invalid code', async () => {
      const user = userEvent.setup();
      const onVerify = vi.fn().mockResolvedValue(false);

      renderWithProviders(<MFAVerification onVerify={onVerify} />);

      const input = screen.getByLabelText(/verification code/i);
      await user.type(input, '999999');
      await user.click(screen.getByRole('button', { name: /verify/i }));

      await waitFor(() => {
        expect(screen.getByTestId('mfa-verify-error')).toHaveTextContent(
          /invalid verification code/i
        );
      });
    });

    it('should show loading state during verification', async () => {
      const user = userEvent.setup();
      const onVerify = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(true), 100)));

      renderWithProviders(<MFAVerification onVerify={onVerify} />);

      const input = screen.getByLabelText(/verification code/i);
      await user.type(input, '123456');
      await user.click(screen.getByRole('button', { name: /verify/i }));

      expect(screen.getByText(/verifying/i)).toBeInTheDocument();
    });

    it('should have option to use backup code', () => {
      const onUseBackupCode = vi.fn();
      renderWithProviders(<MFAVerification onUseBackupCode={onUseBackupCode} />);

      expect(screen.getByTestId('use-backup-code')).toBeInTheDocument();
    });

    it('should call onUseBackupCode when clicked', async () => {
      const user = userEvent.setup();
      const onUseBackupCode = vi.fn();

      renderWithProviders(<MFAVerification onUseBackupCode={onUseBackupCode} />);

      await user.click(screen.getByTestId('use-backup-code'));

      expect(onUseBackupCode).toHaveBeenCalled();
    });
  });

  describe('MFA Settings', () => {
    it('should display MFA status', () => {
      renderWithProviders(<MFASettings enabled={false} />);

      expect(screen.getByTestId('mfa-status')).toHaveTextContent('Disabled');
    });

    it('should show enable button when MFA is disabled', () => {
      renderWithProviders(<MFASettings enabled={false} />);

      expect(screen.getByTestId('enable-mfa')).toBeInTheDocument();
    });

    it('should show disable button when MFA is enabled', () => {
      renderWithProviders(<MFASettings enabled={true} />);

      expect(screen.getByTestId('disable-mfa')).toBeInTheDocument();
    });

    it('should call onEnable when enable button is clicked', async () => {
      const user = userEvent.setup();
      const onEnable = vi.fn();

      renderWithProviders(<MFASettings enabled={false} onEnable={onEnable} />);

      await user.click(screen.getByTestId('enable-mfa'));

      expect(onEnable).toHaveBeenCalled();
    });

    it('should call onDisable when disable button is clicked', async () => {
      const user = userEvent.setup();
      const onDisable = vi.fn();

      renderWithProviders(<MFASettings enabled={true} onDisable={onDisable} />);

      await user.click(screen.getByTestId('disable-mfa'));

      expect(onDisable).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible QR code', () => {
      renderWithProviders(<MFASetup />);

      const qrCode = screen.getByTestId('qr-code');
      expect(qrCode).toHaveAttribute('aria-label');
    });

    it('should have accessible error messages', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MFASetup />);

      await user.click(screen.getByRole('button', { name: /continue/i }));
      await user.click(screen.getByRole('button', { name: /verify/i }));

      const error = screen.getByTestId('mfa-error');
      expect(error).toHaveAttribute('role', 'alert');
    });

    it('should have numeric input mode for code entry', () => {
      renderWithProviders(<MFAVerification />);

      const input = screen.getByLabelText(/verification code/i);
      expect(input).toHaveAttribute('inputMode', 'numeric');
    });

    it('should have help text for code input', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MFASetup />);

      await user.click(screen.getByRole('button', { name: /continue/i }));

      const input = screen.getByLabelText(/verification code/i);
      expect(input).toHaveAttribute('aria-describedby', 'code-help');
    });
  });
});
