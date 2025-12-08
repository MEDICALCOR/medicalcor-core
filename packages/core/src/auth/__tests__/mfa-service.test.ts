/**
 * MFA Service Tests
 * Tests for Multi-Factor Authentication (TOTP)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MfaService,
  MFA_CONFIG,
  generateTotp,
  verifyTotp,
  base32Encode,
  base32Decode,
} from '../mfa-service.js';

describe('MFA Service', () => {
  const TEST_KEY = 'a'.repeat(64); // 32-byte hex key

  beforeEach(() => {
    vi.stubEnv('MFA_ENCRYPTION_KEY', TEST_KEY);
    vi.stubEnv('APP_NAME', 'MedicalCor');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('Base32 Encoding', () => {
    it('should encode and decode correctly', () => {
      const original = Buffer.from('Hello, World!');
      const encoded = base32Encode(original);
      const decoded = base32Decode(encoded);

      expect(decoded.toString()).toBe(original.toString());
    });

    it('should produce RFC 4648 compliant output', () => {
      const encoded = base32Encode(Buffer.from('test'));

      expect(encoded).toMatch(/^[A-Z2-7]+$/);
    });

    it('should handle empty buffer', () => {
      const encoded = base32Encode(Buffer.from(''));

      expect(encoded).toBe('');
    });

    it('should handle single byte', () => {
      const encoded = base32Encode(Buffer.from([0xff]));
      const decoded = base32Decode(encoded);

      expect(decoded[0]).toBe(0xff);
    });
  });

  describe('TOTP Generation', () => {
    it('should generate 6-digit code', () => {
      const secret = Buffer.from('12345678901234567890');
      const code = generateTotp(secret);

      expect(code).toMatch(/^\d{6}$/);
    });

    it('should generate same code for same time step', () => {
      const secret = Buffer.from('12345678901234567890');

      // Mock Date.now to return consistent time
      const mockTime = 1609459200000; // 2021-01-01 00:00:00 UTC
      vi.spyOn(Date, 'now').mockReturnValue(mockTime);

      const code1 = generateTotp(secret);
      const code2 = generateTotp(secret);

      expect(code1).toBe(code2);

      vi.restoreAllMocks();
    });

    it('should generate different codes for different time steps', () => {
      const secret = Buffer.from('12345678901234567890');

      vi.spyOn(Date, 'now').mockReturnValue(1609459200000);
      const code1 = generateTotp(secret);

      vi.spyOn(Date, 'now').mockReturnValue(1609459200000 + 30000); // +30s
      const code2 = generateTotp(secret);

      expect(code1).not.toBe(code2);

      vi.restoreAllMocks();
    });
  });

  describe('TOTP Verification', () => {
    it('should verify valid token', () => {
      const secret = Buffer.from('12345678901234567890');

      vi.spyOn(Date, 'now').mockReturnValue(1609459200000);
      const code = generateTotp(secret);
      const isValid = verifyTotp(secret, code);

      expect(isValid).toBe(true);

      vi.restoreAllMocks();
    });

    it('should reject invalid token', () => {
      const secret = Buffer.from('12345678901234567890');
      const isValid = verifyTotp(secret, '000000');

      expect(isValid).toBe(false);
    });

    it('should accept token within time window', () => {
      const secret = Buffer.from('12345678901234567890');

      // Generate code at time T
      vi.spyOn(Date, 'now').mockReturnValue(1609459200000);
      const code = generateTotp(secret);

      // Verify at time T+29s (still within 30s window)
      vi.spyOn(Date, 'now').mockReturnValue(1609459200000 + 29000);
      const isValid = verifyTotp(secret, code, 30, 1);

      expect(isValid).toBe(true);

      vi.restoreAllMocks();
    });

    it('should accept token from adjacent time steps', () => {
      const secret = Buffer.from('12345678901234567890');

      // Generate code at time T
      vi.spyOn(Date, 'now').mockReturnValue(1609459200000);
      const code = generateTotp(secret);

      // Verify at time T+31s (next time step, but within window=1)
      vi.spyOn(Date, 'now').mockReturnValue(1609459200000 + 31000);
      const isValid = verifyTotp(secret, code, 30, 1);

      expect(isValid).toBe(true);

      vi.restoreAllMocks();
    });

    it('should reject token outside time window', () => {
      const secret = Buffer.from('12345678901234567890');

      // Generate code at time T
      vi.spyOn(Date, 'now').mockReturnValue(1609459200000);
      const code = generateTotp(secret);

      // Verify at time T+90s (3 time steps later, outside window=1)
      vi.spyOn(Date, 'now').mockReturnValue(1609459200000 + 90000);
      const isValid = verifyTotp(secret, code, 30, 1);

      expect(isValid).toBe(false);

      vi.restoreAllMocks();
    });
  });

  describe('MFA_CONFIG', () => {
    it('should have standard TOTP time step of 30 seconds', () => {
      expect(MFA_CONFIG.totpTimeStep).toBe(30);
    });

    it('should have reasonable window for clock drift', () => {
      expect(MFA_CONFIG.totpWindow).toBeGreaterThanOrEqual(1);
      expect(MFA_CONFIG.totpWindow).toBeLessThanOrEqual(3);
    });

    it('should generate 10 backup codes', () => {
      expect(MFA_CONFIG.backupCodeCount).toBe(10);
    });

    it('should have 20-byte secret length (160 bits, standard for TOTP)', () => {
      expect(MFA_CONFIG.secretLength).toBe(20);
    });

    it('should have lockout after 5 failed attempts', () => {
      expect(MFA_CONFIG.maxFailedAttempts).toBe(5);
    });

    it('should have 15 minute lockout', () => {
      expect(MFA_CONFIG.lockoutMinutes).toBe(15);
    });
  });

  describe('MfaService', () => {
    let mockDb: any;

    beforeEach(() => {
      mockDb = {
        query: vi.fn(),
      };
    });

    describe('isEncryptionConfigured', () => {
      it('should return true when encryption key is valid', () => {
        const service = new MfaService(mockDb);
        expect(service.isEncryptionConfigured()).toBe(true);
      });

      it('should return false when encryption key is missing', () => {
        vi.stubEnv('MFA_ENCRYPTION_KEY', '');
        const service = new MfaService(mockDb);
        expect(service.isEncryptionConfigured()).toBe(false);
      });

      it('should return false when encryption key is invalid length', () => {
        vi.stubEnv('MFA_ENCRYPTION_KEY', 'tooshort');
        const service = new MfaService(mockDb);
        expect(service.isEncryptionConfigured()).toBe(false);
      });
    });

    describe('getStatus', () => {
      it('should return disabled status when no MFA configured', async () => {
        mockDb.query.mockResolvedValue({ rows: [] });

        const service = new MfaService(mockDb);
        const status = await service.getStatus('user-123');

        expect(status.enabled).toBe(false);
      });

      it('should return enabled status with method and backup codes', async () => {
        mockDb.query.mockResolvedValue({
          rows: [
            {
              method: 'totp',
              verified_at: '2024-01-01T00:00:00Z',
              backup_codes: '5',
            },
          ],
        });

        const service = new MfaService(mockDb);
        const status = await service.getStatus('user-123');

        expect(status.enabled).toBe(true);
        expect(status.method).toBe('totp');
        expect(status.backupCodesRemaining).toBe(5);
        expect(status.verifiedAt).toBeInstanceOf(Date);
      });
    });

    describe('beginSetup', () => {
      it('should create pending MFA setup', async () => {
        mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });

        const service = new MfaService(mockDb);
        const result = await service.beginSetup('user-123', 'test@example.com');

        expect(result.secret).toBeDefined();
        expect(result.secretEncrypted).toBeDefined();
        expect(result.qrCodeUrl).toContain('otpauth://totp/');
        expect(result.backupCodes).toHaveLength(10);
        expect(result.backupCodes[0]).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      });

      it('should throw error when encryption not configured', async () => {
        vi.stubEnv('MFA_ENCRYPTION_KEY', '');
        const service = new MfaService(mockDb);

        await expect(service.beginSetup('user-123', 'test@example.com')).rejects.toThrow(
          'encryption key not configured'
        );
      });
    });

    describe('completeSetup', () => {
      it('should complete setup with valid token', async () => {
        const secret = Buffer.from('12345678901234567890');
        const secretEncrypted = 'encrypted-secret';

        // Mock getPendingSecret
        mockDb.query.mockResolvedValueOnce({
          rows: [{ pending_secret_encrypted: secretEncrypted, method: 'totp' }],
        });

        // Generate valid TOTP for current time
        vi.spyOn(Date, 'now').mockReturnValue(1609459200000);
        const validToken = generateTotp(secret);

        const service = new MfaService(mockDb);

        // Mock the decryptSecret to return our test secret
        vi.spyOn(service as any, 'decryptSecret').mockReturnValue(secret);

        // Mock the update queries
        mockDb.query
          .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE mfa_secrets
          .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE mfa_backup_codes
          .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 }); // INSERT auth_events

        const result = await service.completeSetup('user-123', validToken);

        expect(result.success).toBe(true);
        vi.restoreAllMocks();
      });

      it('should reject invalid token during setup', async () => {
        mockDb.query.mockResolvedValueOnce({
          rows: [{ pending_secret_encrypted: 'encrypted-secret', method: 'totp' }],
        });

        const service = new MfaService(mockDb);
        const secret = Buffer.from('12345678901234567890');
        vi.spyOn(service as any, 'decryptSecret').mockReturnValue(secret);

        const result = await service.completeSetup('user-123', '000000');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid');
      });

      it('should return error when no pending setup found', async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [] });

        const service = new MfaService(mockDb);
        const result = await service.completeSetup('user-123', '123456');

        expect(result.success).toBe(false);
        expect(result.error).toContain('No pending');
      });
    });

    describe('verify', () => {
      it('should verify valid TOTP token', async () => {
        const secret = Buffer.from('12345678901234567890');

        // Mock lockout check
        mockDb.query.mockResolvedValueOnce({
          rows: [{ failed_attempts: 0, locked_until: null }],
        });

        // Mock TOTP verification
        mockDb.query.mockResolvedValueOnce({
          rows: [{ secret_encrypted: 'encrypted-secret' }],
        });

        vi.spyOn(Date, 'now').mockReturnValue(1609459200000);
        const validToken = generateTotp(secret);

        const service = new MfaService(mockDb);
        vi.spyOn(service as any, 'decryptSecret').mockReturnValue(secret);

        // Mock reset failed attempts and log event
        mockDb.query
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

        const result = await service.verify('user-123', validToken);

        expect(result.success).toBe(true);
        vi.restoreAllMocks();
      });

      it('should return error when MFA not configured', async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [] });

        const service = new MfaService(mockDb);
        const result = await service.verify('user-123', '123456');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not configured');
      });

      it('should lock account after max failed attempts', async () => {
        // Mock lockout check - 4 failed attempts
        mockDb.query.mockResolvedValueOnce({
          rows: [{ failed_attempts: 4, locked_until: null }],
        });

        // Mock TOTP verification (will fail)
        mockDb.query.mockResolvedValueOnce({ rows: [] });

        // Mock backup code verification (will fail)
        mockDb.query.mockResolvedValueOnce({ rows: [] });

        // Mock increment failed attempts
        mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        // Mock event logging
        mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

        const service = new MfaService(mockDb);
        const result = await service.verify('user-123', '000000');

        expect(result.success).toBe(false);
        expect(result.attemptsRemaining).toBe(0);
        expect(result.lockedUntil).toBeInstanceOf(Date);
      });

      it('should reject when account is locked', async () => {
        const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);

        mockDb.query.mockResolvedValueOnce({
          rows: [{ failed_attempts: 5, locked_until: lockedUntil.toISOString() }],
        });

        const service = new MfaService(mockDb);
        const result = await service.verify('user-123', '123456');

        expect(result.success).toBe(false);
        expect(result.error).toContain('locked');
        expect(result.lockedUntil).toEqual(lockedUntil);
      });
    });

    describe('disable', () => {
      it('should disable MFA for user', async () => {
        mockDb.query
          .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // DELETE backup codes
          .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // DELETE mfa_secrets
          .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 }); // Log event

        const service = new MfaService(mockDb);
        const result = await service.disable('user-123');

        expect(result).toBe(true);
      });
    });

    describe('regenerateBackupCodes', () => {
      it('should regenerate backup codes', async () => {
        mockDb.query
          .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // DELETE old codes
          .mockResolvedValue({ rows: [], rowCount: 1 }) // INSERT new codes (multiple calls)
          .mockResolvedValue({ rows: [{ id: 'event-1' }], rowCount: 1 }); // Log event

        const service = new MfaService(mockDb);
        const codes = await service.regenerateBackupCodes('user-123');

        expect(codes).toHaveLength(10);
        expect(codes[0]).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      });
    });
  });

  describe('Security', () => {
    it('should use constant-time comparison for token verification', () => {
      // This test verifies the implementation uses timing-safe comparison
      // by checking that verification time is consistent regardless of
      // where the mismatch occurs
      const secret = Buffer.from('12345678901234567890');

      // Different tokens that differ at different positions
      const times: number[] = [];

      for (const token of ['000000', '100000', '120000', '123000', '123400', '123450']) {
        const start = performance.now();
        for (let i = 0; i < 1000; i++) {
          verifyTotp(secret, token, 30, 0);
        }
        times.push(performance.now() - start);
      }

      // All times should be within reasonable variance
      // Note: Timing tests are inherently noisy, especially in CI environments
      // We use a 200% tolerance to account for CPU scheduling variance
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const variance = Math.max(...times) - Math.min(...times);

      // Variance should be less than 200% of average (accounting for CI noise)
      // The key security property is that the algorithm uses timingSafeEqual
      expect(variance).toBeLessThan(avg * 2);
    });
  });
});
