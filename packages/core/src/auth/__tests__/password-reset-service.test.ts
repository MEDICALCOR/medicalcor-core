/**
 * Password Reset Service Tests
 * Comprehensive tests for password reset flow and security
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PasswordResetService, PASSWORD_RESET_CONFIG } from '../password-reset-service.js';
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

describe('PasswordResetService', () => {
  let mockDb: DatabasePool;
  let service: PasswordResetService;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new PasswordResetService(mockDb);
    // Don't use fake timers as they interfere with setTimeout in constant-time response
  });

  afterEach(() => {
    // No timers to clean up
  });

  describe('requestReset', () => {
    it('should generate reset token for valid user', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock user lookup
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

      // Mock recent tokens check
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock invalidate existing tokens
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      // Mock token creation
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Mock event logging
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'event-1' }],
        rowCount: 1,
      });

      const result = await service.requestReset('test@example.com', {
        ipAddress: '192.168.1.1',
      });

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token).toHaveLength(64);
    });

    it('should return success for non-existent email (security)', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock user not found
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Mock dummy work query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.requestReset('nonexistent@example.com');

      // Should still return success to prevent email enumeration
      expect(result.success).toBe(true);
      expect(result.token).toBeUndefined();
    });

    it('should return success for inactive account (security)', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

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

      // Mock dummy work query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.requestReset('test@example.com');

      // Should still return success to prevent status enumeration
      expect(result.success).toBe(true);
      expect(result.token).toBeUndefined();
    });

    it('should enforce rate limiting - max requests per hour', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock user lookup
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

      // Mock recent tokens - 3 in last hour (max)
      const now = Date.now();
      mockQuery.mockResolvedValueOnce({
        rows: [
          { created_at: new Date(now - 10 * 60 * 1000).toISOString() },
          { created_at: new Date(now - 20 * 60 * 1000).toISOString() },
          { created_at: new Date(now - 30 * 60 * 1000).toISOString() },
        ],
      });

      const result = await service.requestReset('test@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many');
    });

    it('should enforce minimum interval between requests', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock user lookup
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

      // Mock recent token (less than 5 minutes ago)
      const now = Date.now();
      mockQuery.mockResolvedValueOnce({
        rows: [{ created_at: new Date(now - 2 * 60 * 1000).toISOString() }],
      });

      const result = await service.requestReset('test@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('wait');
    });

    it('should invalidate existing unused tokens', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock user lookup
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

      // Mock recent tokens check (from 10 minutes ago - valid)
      mockQuery.mockResolvedValueOnce({
        rows: [{ created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() }],
      });

      // Mock invalidate existing tokens
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Mock token creation
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Mock event logging
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-1' }] });

      await service.requestReset('test@example.com');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE password_reset_tokens'),
        expect.any(Array)
      );
    });

    it('should invalidate existing tokens before creating new one', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock user lookup
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

      // Mock recent tokens check (from 10 minutes ago - valid)
      mockQuery.mockResolvedValueOnce({
        rows: [{ created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() }],
      });

      // Mock invalidate existing tokens - should be called
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Mock token creation
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Mock event logging
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-1' }] });

      await service.requestReset('test@example.com');

      // Verify invalidation was called
      const invalidateCall = mockQuery.mock.calls.find((call: any[]) =>
        call[0]?.includes('UPDATE password_reset_tokens')
      );
      expect(invalidateCall).toBeDefined();
    });
  });

  describe('validateToken', () => {
    it('should validate valid token', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'token-123',
            user_id: 'user-123',
            token_hash: 'hash',
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            used_at: null,
            created_at: new Date().toISOString(),
            email: 'test@example.com',
          },
        ],
        rowCount: 1,
      });

      const result = await service.validateToken('test-token');

      expect(result.valid).toBe(true);
      expect(result.userId).toBe('user-123');
      expect(result.email).toBe('test@example.com');
    });

    it('should reject invalid token', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.validateToken('invalid-token');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid or expired');
    });

    it('should reject expired token', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'token-123',
            user_id: 'user-123',
            token_hash: 'hash',
            expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
            used_at: null,
            created_at: new Date().toISOString(),
            email: 'test@example.com',
          },
        ],
        rowCount: 1,
      });

      const result = await service.validateToken('expired-token');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject already used token', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'token-123',
            user_id: 'user-123',
            token_hash: 'hash',
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            used_at: new Date().toISOString(), // Already used
            created_at: new Date().toISOString(),
            email: 'test@example.com',
          },
        ],
        rowCount: 1,
      });

      const result = await service.validateToken('used-token');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('already been used');
    });
  });

  describe('completeReset', () => {
    it('should complete password reset with valid token', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock token validation (inside validateToken)
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'token-123',
            user_id: 'user-123',
            token_hash: 'hash',
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            used_at: null,
            created_at: new Date().toISOString(),
            email: 'test@example.com',
          },
        ],
        rowCount: 1,
      });

      // Mock mark token as used
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Mock password update
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Mock session revocation
      mockQuery.mockResolvedValueOnce({ rowCount: 2 });

      // Mock unlock account
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Mock event logging
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-1' }] });

      const result = await service.completeReset('valid-token', 'NewPassword123!', {
        ipAddress: '192.168.1.1',
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid token', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.completeReset('invalid-token', 'NewPassword123!');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should revoke all sessions after password reset', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock token validation
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'token-123',
            user_id: 'user-123',
            token_hash: 'hash',
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            used_at: null,
            created_at: new Date().toISOString(),
            email: 'test@example.com',
          },
        ],
        rowCount: 1,
      });

      // Mock subsequent operations
      mockQuery
        .mockResolvedValueOnce({ rowCount: 1 }) // Mark used
        .mockResolvedValueOnce({ rowCount: 1 }) // Update password
        .mockResolvedValueOnce({ rowCount: 3 }) // Revoke sessions
        .mockResolvedValueOnce({ rowCount: 1 }) // Unlock
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }] }); // Log event

      const result = await service.completeReset('valid-token', 'NewPassword123!');

      expect(result.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions'),
        expect.any(Array)
      );
    });

    it('should unlock account after password reset', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      // Mock token validation
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'token-123',
            user_id: 'user-123',
            token_hash: 'hash',
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            used_at: null,
            created_at: new Date().toISOString(),
            email: 'test@example.com',
          },
        ],
        rowCount: 1,
      });

      // Mock subsequent operations
      mockQuery
        .mockResolvedValueOnce({ rowCount: 1 }) // Mark used
        .mockResolvedValueOnce({ rowCount: 1 }) // Update password
        .mockResolvedValueOnce({ rowCount: 0 }) // Revoke sessions
        .mockResolvedValueOnce({ rowCount: 1 }) // Unlock account
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }] }); // Log event

      await service.completeReset('valid-token', 'NewPassword123!');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('locked_until = NULL'),
        expect.any(Array)
      );
    });
  });

  describe('cleanup', () => {
    it('should delete used and expired tokens', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({ rowCount: 50 });

      const count = await service.cleanup();

      expect(count).toBe(50);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM password_reset_tokens')
      );
    });

    it('should return 0 when no tokens to cleanup', async () => {
      const mockQuery = mockDb.query as ReturnType<typeof vi.fn>;

      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const count = await service.cleanup();

      expect(count).toBe(0);
    });
  });

  describe('Configuration', () => {
    it('should have secure token expiration time', () => {
      // 5 minutes for medical application security
      expect(PASSWORD_RESET_CONFIG.expirationMinutes).toBe(5);
    });

    it('should have rate limiting configured', () => {
      expect(PASSWORD_RESET_CONFIG.minRequestIntervalMinutes).toBe(5);
      expect(PASSWORD_RESET_CONFIG.maxRequestsPerHour).toBe(3);
    });
  });
});
