/**
 * Auth Event Repository Tests
 * Comprehensive tests for authentication event logging and audit trail
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthEventRepository } from '../auth-event-repository.js';
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

describe('AuthEventRepository', () => {
  let mockDb: DatabasePool;
  let repo: AuthEventRepository;

  beforeEach(() => {
    mockDb = createMockDb();
    repo = new AuthEventRepository(mockDb);
  });

  describe('log', () => {
    it('should log authentication event', async () => {
      const eventData = {
        userId: 'user-123',
        email: 'test@example.com',
        eventType: 'login_success' as const,
        result: 'success' as const,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        sessionId: 'session-123',
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'event-123',
            user_id: eventData.userId,
            email: eventData.email,
            event_type: eventData.eventType,
            result: eventData.result,
            ip_address: eventData.ipAddress,
            user_agent: eventData.userAgent,
            session_id: eventData.sessionId,
            details: null,
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      const event = await repo.log(eventData);

      expect(event).toBeDefined();
      expect(event.eventType).toBe('login_success');
      expect(event.result).toBe('success');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO auth_events'),
        expect.arrayContaining([
          eventData.userId,
          eventData.email,
          eventData.eventType,
          eventData.result,
        ])
      );
    });

    it('should log event with details object', async () => {
      const eventData = {
        userId: 'user-123',
        eventType: 'login_failure' as const,
        result: 'failure' as const,
        details: { reason: 'invalid_password', attempts: 3 },
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'event-123',
            user_id: eventData.userId,
            event_type: eventData.eventType,
            result: eventData.result,
            details: JSON.stringify(eventData.details),
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      const event = await repo.log(eventData);

      // Details are stored as JSON string, then parsed back
      expect(event.details).toEqual(JSON.stringify(eventData.details));
    });

    it('should log event without optional fields', async () => {
      const eventData = {
        email: 'test@example.com',
        eventType: 'password_reset_requested' as const,
        result: 'success' as const,
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'event-123',
            user_id: null,
            email: eventData.email,
            event_type: eventData.eventType,
            result: eventData.result,
            ip_address: null,
            user_agent: null,
            session_id: null,
            details: null,
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      const event = await repo.log(eventData);

      expect(event).toBeDefined();
      // Database returns null for optional fields, not undefined
      expect(event.userId).toBeNull();
    });
  });

  describe('getForUser', () => {
    it('should get events for a user', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'event-1',
              user_id: 'user-123',
              event_type: 'login_success',
              result: 'success',
              created_at: new Date().toISOString(),
            },
            {
              id: 'event-2',
              user_id: 'user-123',
              event_type: 'logout',
              result: 'success',
              created_at: new Date().toISOString(),
            },
          ],
        });

      const result = await repo.getForUser('user-123', { limit: 2, offset: 0 });

      expect(result.events).toHaveLength(2);
      expect(result.total).toBe(10);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        expect.arrayContaining(['user-123'])
      );
    });

    it('should filter by event types', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await repo.getForUser('user-123', {
        eventTypes: ['login_success', 'login_failure'],
      });

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('event_type = ANY');
    });
  });

  describe('getLoginHistory', () => {
    it('should get login history for user', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'event-1',
            user_id: 'user-123',
            event_type: 'login_success',
            result: 'success',
            ip_address: '192.168.1.1',
            created_at: new Date().toISOString(),
          },
          {
            id: 'event-2',
            user_id: 'user-123',
            event_type: 'login_failure',
            result: 'failure',
            ip_address: '192.168.1.2',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const events = await repo.getLoginHistory('user-123', 10);

      expect(events).toHaveLength(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("event_type IN ('login_success', 'login_failure')"),
        ['user-123', 10]
      );
    });
  });

  describe('getFailedLoginsForEmail', () => {
    it('should get failed login attempts for email', async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'event-1',
            email: 'test@example.com',
            event_type: 'login_failure',
            result: 'failure',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const events = await repo.getFailedLoginsForEmail('test@example.com', since);

      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe('login_failure');
    });
  });

  describe('getFromIp', () => {
    it('should get events from specific IP', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            id: 'event-1',
            ip_address: '192.168.1.1',
            event_type: 'login_success',
            result: 'success',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const events = await repo.getFromIp('192.168.1.1', { limit: 100 });

      expect(events).toHaveLength(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ip_address = $1'),
        expect.arrayContaining(['192.168.1.1'])
      );
    });

    it('should filter by time range', async () => {
      const since = new Date(Date.now() - 60 * 60 * 1000);
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

      await repo.getFromIp('192.168.1.1', { since });

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('created_at > $');
    });

    it('should filter by event types', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

      await repo.getFromIp('192.168.1.1', {
        eventTypes: ['login_failure'],
      });

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('event_type = ANY');
    });
  });

  describe('countByType', () => {
    it('should count events by type', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          { event_type: 'login_success', count: '100' },
          { event_type: 'login_failure', count: '25' },
          { event_type: 'logout', count: '80' },
        ],
      });

      const counts = await repo.countByType(new Date(Date.now() - 24 * 60 * 60 * 1000));

      expect(counts.login_success).toBe(100);
      expect(counts.login_failure).toBe(25);
      expect(counts.logout).toBe(80);
    });
  });

  describe('getSuspiciousActivity', () => {
    it('should detect suspicious activity patterns', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            email: 'victim@example.com',
            failed_attempts: '10',
            unique_ips: '5',
          },
          {
            email: 'target@example.com',
            failed_attempts: '8',
            unique_ips: '4',
          },
        ],
      });

      const suspicious = await repo.getSuspiciousActivity(
        new Date(Date.now() - 24 * 60 * 60 * 1000)
      );

      expect(suspicious).toHaveLength(2);
      expect(suspicious[0]?.email).toBe('victim@example.com');
      expect(suspicious[0]?.failedAttempts).toBe(10);
      expect(suspicious[0]?.uniqueIps).toBe(5);
    });

    it('should only return accounts with significant failures', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

      const suspicious = await repo.getSuspiciousActivity(
        new Date(Date.now() - 24 * 60 * 60 * 1000)
      );

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('HAVING COUNT(*) >= 5');
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete old events', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rowCount: 150 });

      const count = await repo.deleteOlderThan(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));

      expect(count).toBe(150);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM auth_events WHERE created_at < $1'),
        expect.any(Array)
      );
    });

    it('should return 0 when no events deleted', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rowCount: 0 });

      const count = await repo.deleteOlderThan(new Date());

      expect(count).toBe(0);
    });
  });
});
