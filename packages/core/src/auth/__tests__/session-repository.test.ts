/**
 * Session Repository Tests
 * Comprehensive tests for session management and security
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionRepository } from '../session-repository.js';
import type { DatabasePool } from '../../database.js';

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

describe('SessionRepository', () => {
  let mockDb: DatabasePool;
  let repo: SessionRepository;

  beforeEach(() => {
    mockDb = createMockDb();
    repo = new SessionRepository(mockDb);
  });

  describe('create', () => {
    it('should create a new session', async () => {
      const sessionData = {
        userId: 'user-123',
        tokenHash: 'hash-abc',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'session-123',
            user_id: sessionData.userId,
            token_hash: sessionData.tokenHash,
            ip_address: sessionData.ipAddress,
            user_agent: sessionData.userAgent,
            device_info: null,
            expires_at: sessionData.expiresAt.toISOString(),
            revoked_at: null,
            revoked_reason: null,
            last_activity_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      const session = await repo.create(sessionData);

      expect(session).toBeDefined();
      expect(session.userId).toBe(sessionData.userId);
      expect(session.tokenHash).toBe(sessionData.tokenHash);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sessions'),
        expect.arrayContaining([
          sessionData.userId,
          sessionData.tokenHash,
          sessionData.ipAddress,
          sessionData.userAgent,
        ])
      );
    });

    it('should create session with device info', async () => {
      const sessionData = {
        userId: 'user-123',
        tokenHash: 'hash-abc',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        deviceInfo: { browser: 'Chrome', os: 'Windows' },
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'session-123',
            user_id: sessionData.userId,
            token_hash: sessionData.tokenHash,
            ip_address: sessionData.ipAddress,
            user_agent: sessionData.userAgent,
            device_info: JSON.stringify(sessionData.deviceInfo),
            expires_at: sessionData.expiresAt.toISOString(),
            revoked_at: null,
            last_activity_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      const session = await repo.create(sessionData);

      // Device info is stored as JSON string
      expect(session.deviceInfo).toEqual(JSON.stringify(sessionData.deviceInfo));
    });

    it('should throw error when creation fails', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(
        repo.create({
          userId: 'user-123',
          tokenHash: 'hash',
          expiresAt: new Date(),
        })
      ).rejects.toThrow('Failed to create session');
    });
  });

  describe('findById', () => {
    it('should find session by ID', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'session-123',
            user_id: 'user-123',
            token_hash: 'hash',
            expires_at: new Date().toISOString(),
            revoked_at: null,
            last_activity_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      const session = await repo.findById('session-123');

      expect(session).toBeDefined();
      expect(session?.id).toBe('session-123');
    });

    it('should return null when session not found', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const session = await repo.findById('nonexistent');

      expect(session).toBeNull();
    });
  });

  describe('findByTokenHash', () => {
    it('should find session by token hash', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'session-123',
            user_id: 'user-123',
            token_hash: 'hash-abc',
            expires_at: new Date().toISOString(),
            revoked_at: null,
            last_activity_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      const session = await repo.findByTokenHash('hash-abc');

      expect(session).toBeDefined();
      expect(session?.tokenHash).toBe('hash-abc');
    });
  });

  describe('validate', () => {
    it('should validate active non-expired session', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'session-123',
            user_id: 'user-123',
            token_hash: 'hash',
            expires_at: new Date(Date.now() + 1000000).toISOString(),
            revoked_at: null,
            last_activity_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      const session = await repo.validate('hash');

      expect(session).toBeDefined();
      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('expires_at > CURRENT_TIMESTAMP');
      expect(query).toContain('revoked_at IS NULL');
    });

    it('should return null for expired session', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const session = await repo.validate('hash');

      expect(session).toBeNull();
    });

    it('should return null for revoked session', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const session = await repo.validate('hash');

      expect(session).toBeNull();
    });
  });

  describe('updateActivity', () => {
    it('should update last activity timestamp', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      await repo.updateActivity('session-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('last_activity_at = CURRENT_TIMESTAMP'),
        ['session-123']
      );
    });
  });

  describe('revoke', () => {
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

    it('should only revoke non-revoked sessions', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      await repo.revoke('session-123', 'logout');

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('revoked_at IS NULL');
    });
  });

  describe('revokeAllForUser', () => {
    it('should revoke all user sessions', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rowCount: 3 });

      const count = await repo.revokeAllForUser('user-123', 'logout_all');

      expect(count).toBe(3);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1 AND revoked_at IS NULL'),
        ['user-123', 'logout_all']
      );
    });

    it('should return 0 when no sessions to revoke', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rowCount: 0 });

      const count = await repo.revokeAllForUser('user-123', 'logout_all');

      expect(count).toBe(0);
    });
  });

  describe('revokeOthers', () => {
    it('should revoke all sessions except specified one', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rowCount: 2 });

      const count = await repo.revokeOthers('user-123', 'session-keep', 'password_changed');

      expect(count).toBe(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1 AND id != $2'),
        ['user-123', 'session-keep', 'password_changed']
      );
    });
  });

  describe('getActiveForUser', () => {
    it('should get active sessions for user', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'session-1',
            user_id: 'user-123',
            token_hash: 'hash1',
            expires_at: new Date(Date.now() + 1000000).toISOString(),
            revoked_at: null,
            last_activity_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
          {
            id: 'session-2',
            user_id: 'user-123',
            token_hash: 'hash2',
            expires_at: new Date(Date.now() + 1000000).toISOString(),
            revoked_at: null,
            last_activity_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        ],
      });

      const sessions = await repo.getActiveForUser('user-123');

      expect(sessions).toHaveLength(2);
      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('expires_at > CURRENT_TIMESTAMP');
      expect(query).toContain('revoked_at IS NULL');
    });
  });

  describe('countActiveForUser', () => {
    it('should count active sessions for user', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [{ count: '5' }],
      });

      const count = await repo.countActiveForUser('user-123');

      expect(count).toBe(5);
    });

    it('should return 0 when no active sessions', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [{ count: '0' }],
      });

      const count = await repo.countActiveForUser('user-123');

      expect(count).toBe(0);
    });
  });

  describe('enforceSessionLimit', () => {
    it('should revoke oldest sessions when limit exceeded', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [{ id: 'session-old-1' }, { id: 'session-old-2' }],
        rowCount: 2,
      });

      const count = await repo.enforceSessionLimit('user-123', 5, 'max_sessions_exceeded');

      expect(count).toBe(2);
      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('ROW_NUMBER()');
      expect(query).toContain('FOR UPDATE'); // Should use row lock
    });

    it('should use atomic operation to prevent TOCTOU', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rowCount: 1 });

      await repo.enforceSessionLimit('user-123', 3, 'limit_exceeded');

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      // Should be a single atomic CTE query
      expect(query).toContain('WITH active_sessions AS');
      expect(query).toContain('sessions_to_revoke AS');
    });

    it('should return 0 when under limit', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rowCount: 0 });

      const count = await repo.enforceSessionLimit('user-123', 10, 'limit');

      expect(count).toBe(0);
    });
  });

  describe('deleteExpired', () => {
    it('should delete expired sessions', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rowCount: 50 });

      const count = await repo.deleteExpired();

      expect(count).toBe(50);
      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain("expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days'");
    });
  });

  describe('getStats', () => {
    it('should return session statistics', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            total: '100',
            active: '50',
            expired: '30',
            revoked: '20',
          },
        ],
      });

      const stats = await repo.getStats();

      expect(stats.total).toBe(100);
      expect(stats.active).toBe(50);
      expect(stats.expired).toBe(30);
      expect(stats.revoked).toBe(20);
    });

    it('should return zeros when no sessions', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

      const stats = await repo.getStats();

      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.expired).toBe(0);
      expect(stats.revoked).toBe(0);
    });
  });
});
