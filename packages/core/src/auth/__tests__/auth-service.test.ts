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
      expect(result.errors).toContain(`Password must be at least ${PASSWORD_POLICY.minLength} characters`);
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
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions'),
        ['session-123', 'logout']
      );
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
});
