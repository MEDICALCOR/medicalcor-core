/**
 * Login Attempt Repository Tests
 * Comprehensive tests for brute force protection and rate limiting
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoginAttemptRepository, RATE_LIMIT_CONFIG } from '../login-attempt-repository.js';
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

describe('LoginAttemptRepository', () => {
  let mockDb: DatabasePool;
  let repo: LoginAttemptRepository;

  beforeEach(() => {
    mockDb = createMockDb();
    repo = new LoginAttemptRepository(mockDb);
  });

  describe('record', () => {
    it('should record successful login attempt', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'attempt-1',
            email: 'test@example.com',
            ip_address: '192.168.1.1',
            success: true,
            failure_reason: null,
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      const attempt = await repo.record({
        email: 'test@example.com',
        ipAddress: '192.168.1.1',
        success: true,
      });

      expect(attempt).toBeDefined();
      expect(attempt.success).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO login_attempts'),
        ['test@example.com', '192.168.1.1', true, null]
      );
    });

    it('should record failed login attempt with reason', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'attempt-1',
            email: 'test@example.com',
            ip_address: '192.168.1.1',
            success: false,
            failure_reason: 'invalid_password',
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      const attempt = await repo.record({
        email: 'test@example.com',
        ipAddress: '192.168.1.1',
        success: false,
        failureReason: 'invalid_password',
      });

      expect(attempt.success).toBe(false);
      expect(attempt.failureReason).toBe('invalid_password');
    });

    it('should lowercase email when recording', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'attempt-1',
            email: 'test@example.com',
            ip_address: '192.168.1.1',
            success: true,
            failure_reason: null,
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      await repo.record({
        email: 'TEST@EXAMPLE.COM',
        ipAddress: '192.168.1.1',
        success: true,
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['test@example.com'])
      );
    });
  });

  describe('checkRateLimit', () => {
    it('should allow login when under rate limit', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // Email count
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // IP count

      const result = await repo.checkRateLimit('test@example.com', '192.168.1.1');

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(3); // 5 max - 2 failed
    });

    it('should block when email rate limit exceeded', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // Email count (max)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // IP count

      const result = await repo.checkRateLimit('test@example.com', '192.168.1.1');

      expect(result.allowed).toBe(false);
      expect(result.remainingAttempts).toBe(0);
      expect(result.reason).toContain('email');
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it('should block when IP rate limit exceeded', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Email count
        .mockResolvedValueOnce({ rows: [{ count: '20' }] }); // IP count (max)

      const result = await repo.checkRateLimit('test@example.com', '192.168.1.1');

      expect(result.allowed).toBe(false);
      expect(result.remainingAttempts).toBe(0);
      expect(result.reason).toContain('IP');
    });

    it('should only count failed attempts within time window', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [{ count: '10' }] });

      await repo.checkRateLimit('test@example.com', '192.168.1.1');

      const calls = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls;
      const emailQuerySql = calls[0]?.[0];

      // Should filter by created_at timestamp (time window)
      expect(emailQuerySql).toContain('created_at > $2');
    });
  });

  describe('getRecentForEmail', () => {
    it('should get recent attempts for email', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'attempt-1',
            email: 'test@example.com',
            ip_address: '192.168.1.1',
            success: false,
            failure_reason: 'invalid_password',
            created_at: new Date().toISOString(),
          },
          {
            id: 'attempt-2',
            email: 'test@example.com',
            ip_address: '192.168.1.2',
            success: true,
            failure_reason: null,
            created_at: new Date().toISOString(),
          },
        ],
      });

      const attempts = await repo.getRecentForEmail('test@example.com', 10);

      expect(attempts).toHaveLength(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(email) = LOWER($1)'),
        ['test@example.com', 10]
      );
    });
  });

  describe('getRecentForIp', () => {
    it('should get recent attempts for IP', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'attempt-1',
            email: 'test1@example.com',
            ip_address: '192.168.1.1',
            success: false,
            created_at: new Date().toISOString(),
          },
          {
            id: 'attempt-2',
            email: 'test2@example.com',
            ip_address: '192.168.1.1',
            success: false,
            created_at: new Date().toISOString(),
          },
        ],
      });

      const attempts = await repo.getRecentForIp('192.168.1.1', 10);

      expect(attempts).toHaveLength(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ip_address = $1'),
        ['192.168.1.1', 10]
      );
    });
  });

  describe('getSuspiciousIps', () => {
    it('should detect IPs with high failure rates', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            ip_address: '192.168.1.100',
            total_attempts: '50',
            failed_attempts: '45',
            unique_emails: '10',
          },
          {
            ip_address: '192.168.1.101',
            total_attempts: '30',
            failed_attempts: '25',
            unique_emails: '8',
          },
        ],
      });

      const suspicious = await repo.getSuspiciousIps(new Date(Date.now() - 24 * 60 * 60 * 1000), 10);

      expect(suspicious).toHaveLength(2);
      expect(suspicious[0]?.ipAddress).toBe('192.168.1.100');
      expect(suspicious[0]?.totalAttempts).toBe(50);
      expect(suspicious[0]?.failedAttempts).toBe(45);
      expect(suspicious[0]?.uniqueEmails).toBe(10);
    });

    it('should only return IPs with minimum failures', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

      await repo.getSuspiciousIps(new Date(Date.now() - 24 * 60 * 60 * 1000), 20);

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('HAVING COUNT(*) FILTER (WHERE success = FALSE) >= $2');
    });
  });

  describe('getStats', () => {
    it('should return login attempt statistics', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            total: '100',
            successful: '75',
            failed: '25',
            unique_emails: '20',
            unique_ips: '15',
          },
        ],
      });

      const stats = await repo.getStats(new Date(Date.now() - 24 * 60 * 60 * 1000));

      expect(stats.total).toBe(100);
      expect(stats.successful).toBe(75);
      expect(stats.failed).toBe(25);
      expect(stats.uniqueEmails).toBe(20);
      expect(stats.uniqueIps).toBe(15);
    });

    it('should return zeros when no data', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

      const stats = await repo.getStats(new Date(Date.now() - 24 * 60 * 60 * 1000));

      expect(stats.total).toBe(0);
      expect(stats.successful).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete old login attempts', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rowCount: 500 });

      const count = await repo.deleteOlderThan(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

      expect(count).toBe(500);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM login_attempts WHERE created_at < $1'),
        expect.any(Array)
      );
    });
  });

  describe('clearRateLimitForEmail', () => {
    it('should clear recent failed attempts for email', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rowCount: 5 });

      const count = await repo.clearRateLimitForEmail('test@example.com');

      expect(count).toBe(5);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM login_attempts'),
        expect.arrayContaining(['test@example.com'])
      );
    });

    it('should only clear failed attempts within time window', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rowCount: 3 });

      await repo.clearRateLimitForEmail('test@example.com');

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('success = FALSE');
      expect(query).toContain('created_at > $2');
    });
  });

  describe('Configuration', () => {
    it('should have appropriate rate limit thresholds', () => {
      expect(RATE_LIMIT_CONFIG.maxFailedAttemptsPerEmail).toBe(5);
      expect(RATE_LIMIT_CONFIG.maxFailedAttemptsPerIp).toBe(20);
      expect(RATE_LIMIT_CONFIG.windowMinutes).toBe(15);
      expect(RATE_LIMIT_CONFIG.lockoutMinutes).toBe(30);
    });
  });
});
