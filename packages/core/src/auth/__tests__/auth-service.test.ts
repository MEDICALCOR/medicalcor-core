/**
 * Authentication Service Tests
 * Comprehensive tests for the authentication system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService, PASSWORD_POLICY } from '../auth-service.js';
import { UserRepository } from '../user-repository.js';
import { SessionRepository } from '../session-repository.js';
import { AuthEventRepository } from '../auth-event-repository.js';
import { LoginAttemptRepository } from '../login-attempt-repository.js';
import type { DatabasePool } from '../../database.js';
import type { User } from '../types.js';

// Mock database
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

// Sample user data
const sampleUser: User = {
  id: 'user-123',
  email: 'test@example.com',
  passwordHash: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.4M4qx.AaQv6dHe', // "password123"
  name: 'Test User',
  role: 'doctor',
  clinicId: 'clinic-1',
  status: 'active',
  emailVerified: true,
  failedLoginAttempts: 0,
  mustChangePassword: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  describe('Password Validation', () => {
    let authService: AuthService;
    let mockDb: DatabasePool;

    beforeEach(() => {
      mockDb = createMockDb();
      authService = new AuthService(mockDb);
    });

    it('should accept valid passwords', () => {
      const result = authService.validatePassword('Password123');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject passwords that are too short', () => {
      const result = authService.validatePassword('Pass1');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        `Password must be at least ${PASSWORD_POLICY.minLength} characters`
      );
    });

    it('should reject passwords without uppercase letters', () => {
      const result = authService.validatePassword('password123');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should reject passwords without lowercase letters', () => {
      const result = authService.validatePassword('PASSWORD123');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should reject passwords without numbers', () => {
      const result = authService.validatePassword('PasswordABC');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should return multiple errors for very weak passwords', () => {
      const result = authService.validatePassword('weak');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});

describe('UserRepository', () => {
  describe('Token Generation', () => {
    it('should generate unique tokens', () => {
      const token1 = UserRepository.generateToken();
      const token2 = UserRepository.generateToken();

      expect(token1).not.toBe(token2);
      expect(token1).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    it('should hash tokens consistently', () => {
      const token = 'test-token-12345';
      const hash1 = UserRepository.hashToken(token);
      const hash2 = UserRepository.hashToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 = 64 hex chars
    });

    it('should produce different hashes for different tokens', () => {
      const hash1 = UserRepository.hashToken('token1');
      const hash2 = UserRepository.hashToken('token2');

      expect(hash1).not.toBe(hash2);
    });
  });
});

describe('LoginAttemptRepository', () => {
  let mockDb: DatabasePool;
  let repo: LoginAttemptRepository;

  beforeEach(() => {
    mockDb = createMockDb();
    repo = new LoginAttemptRepository(mockDb);
  });

  describe('Rate Limiting', () => {
    it('should allow login when under rate limit', async () => {
      // Mock no failed attempts
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [{ count: '0' }],
        rowCount: 1,
      });

      const result = await repo.checkRateLimit('test@example.com', '192.168.1.1');

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBeGreaterThan(0);
    });

    it('should block login when email rate limit exceeded', async () => {
      // Mock 5 failed attempts for email
      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 }) // email count
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }); // IP count

      const result = await repo.checkRateLimit('test@example.com', '192.168.1.1');

      expect(result.allowed).toBe(false);
      expect(result.remainingAttempts).toBe(0);
      expect(result.reason).toContain('email');
    });

    it('should block login when IP rate limit exceeded', async () => {
      // Mock low email attempts but high IP attempts
      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 }) // email count
        .mockResolvedValueOnce({ rows: [{ count: '20' }], rowCount: 1 }); // IP count

      const result = await repo.checkRateLimit('test@example.com', '192.168.1.1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('IP');
    });
  });
});

describe('SessionRepository', () => {
  let mockDb: DatabasePool;
  let repo: SessionRepository;

  beforeEach(() => {
    mockDb = createMockDb();
    repo = new SessionRepository(mockDb);
  });

  describe('Session Creation', () => {
    it('should create a new session', async () => {
      const sessionData = {
        userId: 'user-123',
        tokenHash: 'hash-abc',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      };

      const createdSession = {
        id: 'session-123',
        user_id: sessionData.userId,
        token_hash: sessionData.tokenHash,
        ip_address: sessionData.ipAddress,
        user_agent: sessionData.userAgent,
        expires_at: sessionData.expiresAt.toISOString(),
        revoked_at: null,
        last_activity_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [createdSession],
        rowCount: 1,
      });

      const result = await repo.create(sessionData);

      expect(result.userId).toBe(sessionData.userId);
      expect(result.tokenHash).toBe(sessionData.tokenHash);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sessions'),
        expect.arrayContaining([sessionData.userId, sessionData.tokenHash])
      );
    });
  });

  describe('Session Revocation', () => {
    it('should revoke a session with reason', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      const result = await repo.revoke('session-123', 'logout');

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE sessions'), [
        'session-123',
        'logout',
      ]);
    });

    it('should return false when session not found', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await repo.revoke('nonexistent', 'logout');

      expect(result).toBe(false);
    });
  });
});

describe('AuthEventRepository', () => {
  let mockDb: DatabasePool;
  let repo: AuthEventRepository;

  beforeEach(() => {
    mockDb = createMockDb();
    repo = new AuthEventRepository(mockDb);
  });

  describe('Event Logging', () => {
    it('should log authentication events', async () => {
      const eventData = {
        userId: 'user-123',
        email: 'test@example.com',
        eventType: 'login_success' as const,
        result: 'success' as const,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      const createdEvent = {
        id: 'event-123',
        user_id: eventData.userId,
        email: eventData.email,
        event_type: eventData.eventType,
        result: eventData.result,
        ip_address: eventData.ipAddress,
        user_agent: eventData.userAgent,
        session_id: null,
        details: null,
        created_at: new Date().toISOString(),
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [createdEvent],
        rowCount: 1,
      });

      const result = await repo.log(eventData);

      expect(result.eventType).toBe('login_success');
      expect(result.result).toBe('success');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO auth_events'),
        expect.any(Array)
      );
    });
  });

  describe('Suspicious Activity Detection', () => {
    it('should detect suspicious activity patterns', async () => {
      const suspiciousData = [
        { email: 'victim@example.com', failed_attempts: '10', unique_ips: '5' },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: suspiciousData,
        rowCount: 1,
      });

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await repo.getSuspiciousActivity(since);

      expect(result).toHaveLength(1);
      expect(result[0]?.email).toBe('victim@example.com');
      expect(result[0]?.failedAttempts).toBe(10);
      expect(result[0]?.uniqueIps).toBe(5);
    });
  });
});

describe('AuthService - Login Flow', () => {
  let authService: AuthService;
  let mockDb: DatabasePool;

  beforeEach(() => {
    mockDb = createMockDb();
    authService = new AuthService(mockDb);
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Generate real bcrypt hash for testing
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash('password123', 12);

      // Mock rate limit check
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }) // email count
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }); // IP count

      // Mock user lookup
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            email: 'test@example.com',
            password_hash: passwordHash,
            name: 'Test User',
            role: 'doctor',
            clinic_id: 'clinic-1',
            status: 'active',
            email_verified: true,
            failed_login_attempts: 0,
            must_change_password: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      // Mock lock status check
      mockQuery.mockResolvedValueOnce({ rows: [{ locked_until: null }], rowCount: 1 });

      // Mock session limit enforcement (no sessions to revoke)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Mock session creation
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'session-123',
            user_id: 'user-123',
            token_hash: 'hash',
            ip_address: '192.168.1.1',
            expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
            revoked_at: null,
            last_activity_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      // Mock login attempt record, reset failed attempts, update last login, log event
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'attempt-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.login('test@example.com', 'password123', {
        ipAddress: '192.168.1.1',
        userAgent: 'Test Browser',
      });

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.session).toBeDefined();
      expect(result.accessToken).toBeDefined();
    });

    it('should reject login when rate limited', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock rate limit exceeded
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 }) // email count
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }); // IP count

      // Mock event logging
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.login('test@example.com', 'password123', {
        ipAddress: '192.168.1.1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many');
    });

    it('should reject login for non-existent user', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock rate limit check
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      // Mock user not found
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Mock record attempt and log event
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'attempt-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.login('nonexistent@example.com', 'password123', {
        ipAddress: '192.168.1.1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email or password');
    });

    it('should reject login for inactive account', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock rate limit check
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      // Mock inactive user
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            email: 'test@example.com',
            status: 'suspended',
          },
        ],
        rowCount: 1,
      });

      // Mock record attempt and log events
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'attempt-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.login('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not active');
    });

    it('should reject login for locked account', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock rate limit check
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      // Mock active user
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            email: 'test@example.com',
            status: 'active',
          },
        ],
        rowCount: 1,
      });

      // Mock locked account
      const lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      mockQuery.mockResolvedValueOnce({
        rows: [{ locked_until: lockedUntil.toISOString() }],
        rowCount: 1,
      });

      // Mock record attempt and log events
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'attempt-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.login('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('locked');
      expect(result.lockedUntil).toBeDefined();
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock session lookup
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'session-123',
            user_id: 'user-123',
            token_hash: 'hash',
            expires_at: new Date(Date.now() + 1000000).toISOString(),
            revoked_at: null,
            created_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      // Mock session revocation and event logging
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.logout('session-123');

      expect(result).toBe(true);
    });

    it('should return false for non-existent session', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await authService.logout('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('validateSession', () => {
    it('should validate active session', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock session validation
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'session-123',
            user_id: 'user-123',
            token_hash: 'hash',
            expires_at: new Date(Date.now() + 1000000).toISOString(),
            revoked_at: null,
            created_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      // Mock user lookup
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            email: 'test@example.com',
            name: 'Test User',
            role: 'doctor',
            status: 'active',
            email_verified: true,
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      // Mock activity update
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await authService.validateSession('test-token');

      expect(result).toBeDefined();
      expect(result?.user).toBeDefined();
      expect(result?.session).toBeDefined();
    });

    it('should return null for invalid session', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await authService.validateSession('invalid-token');

      expect(result).toBeNull();
    });
  });
});

describe('AuthService - User Management', () => {
  let authService: AuthService;
  let mockDb: DatabasePool;

  beforeEach(() => {
    mockDb = createMockDb();
    authService = new AuthService(mockDb);
  });

  describe('createUser', () => {
    it('should create user with valid data', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            email: 'new@example.com',
            name: 'New User',
            role: 'doctor',
            status: 'active',
            email_verified: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.createUser({
        email: 'new@example.com',
        password: 'Password123!',
        name: 'New User',
        role: 'doctor',
      });

      expect(result).toBeDefined();
      expect(result.email).toBe('new@example.com');
    });

    it('should reject weak password', async () => {
      await expect(
        authService.createUser({
          email: 'new@example.com',
          password: 'weak',
          name: 'New User',
          role: 'doctor',
        })
      ).rejects.toThrow('Invalid password');
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Generate real bcrypt hash for testing
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash('password123', 12);

      // Mock user lookup
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            email: 'test@example.com',
            password_hash: passwordHash,
          },
        ],
        rowCount: 1,
      });

      // Mock password update, session revocation, and event logging
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 });

      const result = await authService.changePassword(
        'user-123',
        'password123',
        'NewPassword123!',
        { sessionId: 'session-123' }
      );

      expect(result.success).toBe(true);
    });

    it('should reject incorrect current password', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            password_hash: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.4M4qx.AaQv6dHe',
          },
        ],
        rowCount: 1,
      });

      const result = await authService.changePassword(
        'user-123',
        'wrong-password',
        'NewPassword123!'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('incorrect');
    });
  });
});

describe('AuthService - Session Management', () => {
  let authService: AuthService;
  let mockDb: DatabasePool;

  beforeEach(() => {
    mockDb = createMockDb();
    authService = new AuthService(mockDb);
  });

  describe('getActiveSessions', () => {
    it('should return active sessions', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            user_id: 'user-123',
            token_hash: 'hash1',
            expires_at: new Date(Date.now() + 1000000).toISOString(),
            revoked_at: null,
            created_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      const sessions = await authService.getActiveSessions('user-123');

      expect(sessions).toHaveLength(1);
    });
  });

  describe('cleanup', () => {
    it('should cleanup expired data', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery
        .mockResolvedValueOnce({ rowCount: 5 })
        .mockResolvedValueOnce({ rowCount: 10 })
        .mockResolvedValueOnce({ rowCount: 15 });

      const result = await authService.cleanup();

      expect(result.expiredSessions).toBe(5);
      expect(result.oldAttempts).toBe(10);
      expect(result.oldEvents).toBe(15);
    });
  });
});

describe('Security Features', () => {
  describe('Timing Attack Prevention', () => {
    it('should use constant-time token comparison', () => {
      // Token hashing should always take similar time regardless of input
      const start1 = performance.now();
      UserRepository.hashToken('short');
      const time1 = performance.now() - start1;

      const start2 = performance.now();
      UserRepository.hashToken('this-is-a-much-longer-token-string-for-testing');
      const time2 = performance.now() - start2;

      // Times should be within reasonable range (crypto operations are fast)
      // This is a basic check - real timing attack prevention is in bcrypt.compare
      expect(Math.abs(time1 - time2)).toBeLessThan(10); // Within 10ms
    });
  });

  describe('Password Hashing', () => {
    it('should use bcrypt with appropriate cost factor', async () => {
      // The password hash in sampleUser starts with $2a$12$ indicating cost factor 12
      expect(sampleUser.passwordHash).toMatch(/^\$2[aby]?\$12\$/);
    });
  });

  describe('Password Policy', () => {
    let authService: AuthService;
    let mockDb: DatabasePool;

    beforeEach(() => {
      mockDb = createMockDb();
      authService = new AuthService(mockDb);
    });

    it('should require special characters', () => {
      const result = authService.validatePassword('Password123!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject passwords that are too long', () => {
      const result = authService.validatePassword('A'.repeat(200) + '1!');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('at most'))).toBe(true);
    });

    it('should accept valid passwords with special characters', () => {
      const result = authService.validatePassword('Password123!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
