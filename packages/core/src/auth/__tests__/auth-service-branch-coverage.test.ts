/**
 * Auth Service Branch Coverage Tests
 * Targets specific branches for 85% HIPAA/GDPR coverage threshold
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService, PASSWORD_POLICY, SESSION_CONFIG, RATE_LIMIT_CONFIG } from '../auth-service.js';
import type { DatabasePool } from '../../database.js';

// =============================================================================
// Mock Setup
// =============================================================================

function createMockDb(): DatabasePool {
  const mockQuery = vi.fn();
  return {
    query: mockQuery,
    connect: vi.fn().mockResolvedValue({
      query: mockQuery,
      release: vi.fn(),
    }),
    end: vi.fn().mockResolvedValue(undefined),
  };
}

function createActiveUser() {
  return {
    id: 'user-123',
    email: 'test@example.com',
    password_hash: '$2b$12$validhash',
    name: 'Test User',
    role: 'doctor',
    clinic_id: 'clinic-1',
    status: 'active',
    email_verified: true,
    failed_login_attempts: 0,
    must_change_password: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// =============================================================================
// Login Branch Coverage
// =============================================================================

describe('AuthService Login Branch Coverage', () => {
  let authService: AuthService;
  let mockDb: DatabasePool;

  beforeEach(() => {
    mockDb = createMockDb();
    authService = new AuthService(mockDb);
  });

  describe('Rate Limit Branches', () => {
    it('should use default message when rateLimit.reason is null', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock rate limit exceeded with null reason
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 }) // email count
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }); // IP count

      // Mock event log
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.login('test@example.com', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many');
    });

    it('should use rateLimit.reason when provided', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock rate limit exceeded with specific reason
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '100' }], rowCount: 1 }); // IP rate limit exceeded

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.login('test@example.com', 'password');

      expect(result.success).toBe(false);
    });
  });

  describe('Context Parameter Branches', () => {
    it('should use unknown ipAddress when context is undefined', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Allow rate limit
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      // User not found
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Record attempt and event
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'attempt-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.login('test@example.com', 'password');

      expect(result.success).toBe(false);
      // Verify ipAddress defaults to 'unknown'
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO login_attempts'),
        expect.arrayContaining(['unknown'])
      );
    });

    it('should use provided context values', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'attempt-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      await authService.login('test@example.com', 'password', {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO login_attempts'),
        expect.arrayContaining(['192.168.1.1'])
      );
    });
  });

  describe('Invalid Password Branch', () => {
    it('should handle incrementResult.isErr branch', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('correct-password', 12);

      // Rate limit OK
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      // User found
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...createActiveUser(), password_hash: hash }],
        rowCount: 1,
      });

      // Not locked
      mockQuery.mockResolvedValueOnce({ rows: [{ locked_until: null }], rowCount: 1 });

      // incrementFailedAttempts fails (returns err)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Record attempt and events
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'attempt-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.login('test@example.com', 'wrong-password', {
        ipAddress: '192.168.1.1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email or password');
    });

    it('should log account lock event when lockedUntil is set', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('correct-password', 12);
      const lockedUntil = new Date(Date.now() + 30 * 60 * 1000);

      // Rate limit OK
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      // User found
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...createActiveUser(), password_hash: hash }],
        rowCount: 1,
      });

      // Not locked yet
      mockQuery.mockResolvedValueOnce({ rows: [{ locked_until: null }], rowCount: 1 });

      // incrementFailedAttempts triggers lock
      mockQuery.mockResolvedValueOnce({
        rows: [{ failed_login_attempts: 5, locked_until: lockedUntil.toISOString() }],
        rowCount: 1,
      });

      // Record attempt
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'attempt-1' }], rowCount: 1 });

      // Login failure event
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      // Account locked event
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-2' }], rowCount: 1 });

      const result = await authService.login('test@example.com', 'wrong-password');

      expect(result.success).toBe(false);
      expect(result.lockedUntil).toBeDefined();
    });
  });

  describe('Session Creation Failure Branch', () => {
    it('should return error when session creation fails', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('correct-password', 12);

      // Rate limit OK
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      // User found
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...createActiveUser(), password_hash: hash }],
        rowCount: 1,
      });

      // Not locked
      mockQuery.mockResolvedValueOnce({ rows: [{ locked_until: null }], rowCount: 1 });

      // Session limit enforcement OK
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Session creation fails (empty result)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await authService.login('test@example.com', 'correct-password');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create session. Please try again.');
    });
  });

  describe('Account Status Branches', () => {
    it('should handle suspended account status', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Rate limit OK
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      // User found but suspended
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...createActiveUser(), status: 'suspended' }],
        rowCount: 1,
      });

      // Record attempt and event
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'attempt-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.login('test@example.com', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not active');
    });

    it('should handle pending account status', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      mockQuery.mockResolvedValueOnce({
        rows: [{ ...createActiveUser(), status: 'pending' }],
        rowCount: 1,
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'attempt-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.login('test@example.com', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not active');
    });
  });
});

// =============================================================================
// ValidateSession Branch Coverage
// =============================================================================

describe('AuthService ValidateSession Branch Coverage', () => {
  let authService: AuthService;
  let mockDb: DatabasePool;

  beforeEach(() => {
    mockDb = createMockDb();
    authService = new AuthService(mockDb);
  });

  it('should return null when session not found', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await authService.validateSession('invalid-token');

    expect(result).toBeNull();
  });

  it('should return null when user is not active', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

    // Session found
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'session-123',
          user_id: 'user-123',
          token_hash: 'hash',
          expires_at: new Date(Date.now() + 100000).toISOString(),
          revoked_at: null,
          created_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        },
      ],
      rowCount: 1,
    });

    // User found but not active
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...createActiveUser(), status: 'suspended' }],
      rowCount: 1,
    });

    const result = await authService.validateSession('valid-token');

    expect(result).toBeNull();
  });

  it('should return null when user not found', async () => {
    const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

    // Session found
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'session-123',
          user_id: 'user-123',
          token_hash: 'hash',
          expires_at: new Date(Date.now() + 100000).toISOString(),
          revoked_at: null,
          created_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        },
      ],
      rowCount: 1,
    });

    // User not found
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await authService.validateSession('valid-token');

    expect(result).toBeNull();
  });
});

// =============================================================================
// User Management Branch Coverage
// =============================================================================

describe('AuthService User Management Branch Coverage', () => {
  let authService: AuthService;
  let mockDb: DatabasePool;

  beforeEach(() => {
    mockDb = createMockDb();
    authService = new AuthService(mockDb);
  });

  describe('createUser', () => {
    it('should throw error when userRepo.create fails', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Simulate unique constraint violation
      mockQuery.mockRejectedValueOnce(new Error('duplicate key value'));

      await expect(
        authService.createUser({
          email: 'test@example.com',
          password: 'Password123!',
          name: 'Test User',
          role: 'doctor',
        })
      ).rejects.toThrow('Failed to create user');
    });
  });

  describe('updateUser', () => {
    it('should return null when user not found', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await authService.updateUser('nonexistent', { name: 'New Name' });

      expect(result).toBeNull();
    });

    it('should return updated user and log event', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({
        rows: [{ ...createActiveUser(), name: 'Updated Name' }],
        rowCount: 1,
      });

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.updateUser('user-123', { name: 'Updated Name' });

      expect(result).toBeDefined();
      expect(result?.name).toBe('Updated Name');
    });
  });

  describe('changePassword', () => {
    it('should return error when user not found', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await authService.changePassword(
        'nonexistent',
        'oldPass',
        'NewPassword123!'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should use empty string when context.sessionId is undefined', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('oldPassword123!', 12);

      // User found
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...createActiveUser(), password_hash: hash }],
        rowCount: 1,
      });

      // Password update
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Revoke other sessions (called with empty string)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Event log
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.changePassword(
        'user-123',
        'oldPassword123!',
        'NewPassword123!',
        { ipAddress: '192.168.1.1' } // No sessionId
      );

      expect(result.success).toBe(true);
    });

    it('should return error when new password validation fails', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('oldPassword', 12);

      mockQuery.mockResolvedValueOnce({
        rows: [{ ...createActiveUser(), password_hash: hash }],
        rowCount: 1,
      });

      const result = await authService.changePassword('user-123', 'oldPassword', 'weak');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Password must');
    });
  });

  describe('adminResetPassword', () => {
    it('should throw when password validation fails', async () => {
      await expect(authService.adminResetPassword('user-123', 'weak')).rejects.toThrow(
        'Invalid password'
      );
    });

    it('should return false when updatePassword fails', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // updatePassword returns false
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await authService.adminResetPassword('user-123', 'NewPassword123!');

      expect(result).toBe(false);
    });

    it('should return true and force password change on success', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // updatePassword succeeds
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // update mustChangePassword
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...createActiveUser(), must_change_password: true }],
        rowCount: 1,
      });

      // Revoke all sessions
      mockQuery.mockResolvedValueOnce({ rowCount: 3 });

      // Event log
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.adminResetPassword('user-123', 'NewPassword123!');

      expect(result).toBe(true);
    });
  });

  describe('deleteUser', () => {
    it('should return false when user not found', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await authService.deleteUser('nonexistent');

      expect(result).toBe(false);
    });

    it('should return false when delete fails', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // User found
      mockQuery.mockResolvedValueOnce({
        rows: [createActiveUser()],
        rowCount: 1,
      });

      // Revoke sessions
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      // Delete fails
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await authService.deleteUser('user-123');

      expect(result).toBe(false);
    });

    it('should return true and log event on success', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({
        rows: [createActiveUser()],
        rowCount: 1,
      });

      mockQuery.mockResolvedValueOnce({ rowCount: 2 });

      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.deleteUser('user-123');

      expect(result).toBe(true);
    });
  });
});

// =============================================================================
// Session Management Branch Coverage
// =============================================================================

describe('AuthService Session Management Branch Coverage', () => {
  let authService: AuthService;
  let mockDb: DatabasePool;

  beforeEach(() => {
    mockDb = createMockDb();
    authService = new AuthService(mockDb);
  });

  describe('revokeSession', () => {
    it('should return false when session not found', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await authService.revokeSession('nonexistent');

      expect(result).toBe(false);
    });

    it('should return false when revoke fails', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Session found
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'session-123',
            user_id: 'user-123',
            token_hash: 'hash',
            expires_at: new Date(Date.now() + 100000).toISOString(),
            revoked_at: null,
          },
        ],
        rowCount: 1,
      });

      // Revoke fails
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await authService.revokeSession('session-123');

      expect(result).toBe(false);
    });

    it('should return true and log event on success', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'session-123',
            user_id: 'user-123',
            token_hash: 'hash',
            expires_at: new Date(Date.now() + 100000).toISOString(),
            revoked_at: null,
          },
        ],
        rowCount: 1,
      });

      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.revokeSession('session-123', 'admin_revoke', {
        ipAddress: '192.168.1.1',
      });

      expect(result).toBe(true);
    });
  });

  describe('logout', () => {
    it('should return false when session not found', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await authService.logout('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('logoutAll', () => {
    it('should revoke all sessions and log event', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({ rowCount: 5 });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const count = await authService.logoutAll('user-123');

      expect(count).toBe(5);
    });
  });
});

// =============================================================================
// Password Validation Branch Coverage
// =============================================================================

describe('AuthService Password Validation Branch Coverage', () => {
  let authService: AuthService;

  beforeEach(() => {
    const mockDb = createMockDb();
    authService = new AuthService(mockDb);
  });

  it('should reject password exceeding maxLength', () => {
    const longPassword = 'A'.repeat(129) + '1!';
    const result = authService.validatePassword(longPassword);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at most'))).toBe(true);
  });

  it('should accept password at exactly maxLength', () => {
    const password = 'A'.repeat(124) + 'a1!a';
    const result = authService.validatePassword(password);

    expect(result.valid).toBe(true);
  });

  it('should reject password without special character', () => {
    const result = authService.validatePassword('Password123');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('special character'))).toBe(true);
  });

  it('should accept password with special character', () => {
    const result = authService.validatePassword('Password123!');

    expect(result.valid).toBe(true);
  });

  it('should reject password too short', () => {
    const result = authService.validatePassword('Pa1!');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at least'))).toBe(true);
  });

  it('should return multiple errors for very weak password', () => {
    const result = authService.validatePassword('a');

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

// =============================================================================
// Utility Methods Branch Coverage
// =============================================================================

describe('AuthService Utility Methods Branch Coverage', () => {
  let authService: AuthService;
  let mockDb: DatabasePool;

  beforeEach(() => {
    mockDb = createMockDb();
    authService = new AuthService(mockDb);
  });

  describe('cleanup', () => {
    it('should cleanup all expired data', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery
        .mockResolvedValueOnce({ rowCount: 10 }) // expired sessions
        .mockResolvedValueOnce({ rowCount: 20 }) // old attempts
        .mockResolvedValueOnce({ rowCount: 30 }); // old events

      const result = await authService.cleanup();

      expect(result.expiredSessions).toBe(10);
      expect(result.oldAttempts).toBe(20);
      expect(result.oldEvents).toBe(30);
    });
  });

  describe('unlockAccount', () => {
    it('should unlock account and log event', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // unlock
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 }); // event

      await authService.unlockAccount('user-123', { ipAddress: '192.168.1.1' });

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('getUser', () => {
    it('should return null when user not found', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await authService.getUser('nonexistent');

      expect(result).toBeNull();
    });

    it('should return safe user when found', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({
        rows: [createActiveUser()],
        rowCount: 1,
      });

      const result = await authService.getUser('user-123');

      expect(result).toBeDefined();
      expect(result?.email).toBe('test@example.com');
    });
  });

  describe('getUserByEmail', () => {
    it('should return null when user not found', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await authService.getUserByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });
});

// =============================================================================
// Configuration Export Coverage
// =============================================================================

describe('Configuration Exports', () => {
  it('should export PASSWORD_POLICY', () => {
    expect(PASSWORD_POLICY).toBeDefined();
    expect(PASSWORD_POLICY.minLength).toBe(8);
    expect(PASSWORD_POLICY.maxLength).toBe(128);
    expect(PASSWORD_POLICY.requireSpecial).toBe(true);
  });

  it('should export SESSION_CONFIG', () => {
    expect(SESSION_CONFIG).toBeDefined();
    expect(SESSION_CONFIG.durationHours).toBe(8);
    expect(SESSION_CONFIG.maxConcurrentSessions).toBe(5);
  });

  it('should export RATE_LIMIT_CONFIG', () => {
    expect(RATE_LIMIT_CONFIG).toBeDefined();
    expect(RATE_LIMIT_CONFIG.maxEmailAttempts).toBeDefined();
    expect(RATE_LIMIT_CONFIG.maxIpAttempts).toBeDefined();
  });
});
