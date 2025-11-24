/**
 * Auth Event Repository
 * Audit logging for all authentication-related events
 */

import type { DatabasePool } from '../database.js';
import { createLogger, type Logger } from '../logger.js';
import type { AuthEvent, CreateAuthEventData, AuthEventType, AuthEventResult } from './types.js';

const logger: Logger = createLogger({ name: 'auth-event-repository' });

/** Map database row to AuthEvent entity */
function mapRowToAuthEvent(row: Record<string, unknown>): AuthEvent {
  return {
    id: row.id as string,
    userId: row.user_id as string | undefined,
    email: row.email as string | undefined,
    eventType: row.event_type as AuthEventType,
    result: row.result as AuthEventResult,
    ipAddress: row.ip_address as string | undefined,
    userAgent: row.user_agent as string | undefined,
    sessionId: row.session_id as string | undefined,
    details: row.details as Record<string, unknown> | undefined,
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Auth Event Repository
 * Handles audit logging for authentication events
 */
export class AuthEventRepository {
  constructor(private db: DatabasePool) {}

  /**
   * Log an authentication event
   */
  async log(data: CreateAuthEventData): Promise<AuthEvent> {
    const result = await this.db.query<Record<string, unknown>>(
      `INSERT INTO auth_events (user_id, email, event_type, result, ip_address, user_agent, session_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.userId ?? null,
        data.email ?? null,
        data.eventType,
        data.result,
        data.ipAddress ?? null,
        data.userAgent ?? null,
        data.sessionId ?? null,
        data.details ? JSON.stringify(data.details) : null,
      ]
    );

    const event = mapRowToAuthEvent(result.rows[0]!);

    // Log to structured logger as well for observability
    logger.info(
      {
        eventType: data.eventType,
        result: data.result,
        userId: data.userId,
        email: data.email,
        ip: data.ipAddress,
      },
      `Auth event: ${data.eventType}`
    );

    return event;
  }

  /**
   * Get events for a specific user
   */
  async getForUser(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      eventTypes?: AuthEventType[];
    }
  ): Promise<{ events: AuthEvent[]; total: number }> {
    const { limit = 50, offset = 0, eventTypes } = options ?? {};

    let whereClause = 'WHERE user_id = $1';
    const values: unknown[] = [userId];

    if (eventTypes && eventTypes.length > 0) {
      whereClause += ` AND event_type = ANY($${values.length + 1})`;
      values.push(eventTypes);
    }

    const [countResult, dataResult] = await Promise.all([
      this.db.query<Record<string, unknown>>(
        `SELECT COUNT(*) as count FROM auth_events ${whereClause}`,
        values
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT * FROM auth_events ${whereClause} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
    ]);

    return {
      events: dataResult.rows.map(mapRowToAuthEvent),
      total: parseInt(countResult.rows[0]!.count as string, 10),
    };
  }

  /**
   * Get recent login history for a user
   */
  async getLoginHistory(userId: string, limit = 10): Promise<AuthEvent[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM auth_events
       WHERE user_id = $1 AND event_type IN ('login_success', 'login_failure')
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map(mapRowToAuthEvent);
  }

  /**
   * Get failed login attempts for an email (for security alerts)
   */
  async getFailedLoginsForEmail(email: string, since: Date): Promise<AuthEvent[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM auth_events
       WHERE email = $1 AND event_type = 'login_failure' AND created_at > $2
       ORDER BY created_at DESC`,
      [email.toLowerCase(), since.toISOString()]
    );

    return result.rows.map(mapRowToAuthEvent);
  }

  /**
   * Get events from a specific IP address (for abuse detection)
   */
  async getFromIp(
    ipAddress: string,
    options?: {
      limit?: number;
      since?: Date;
      eventTypes?: AuthEventType[];
    }
  ): Promise<AuthEvent[]> {
    const { limit = 100, since, eventTypes } = options ?? {};

    let whereClause = 'WHERE ip_address = $1';
    const values: unknown[] = [ipAddress];

    if (since) {
      whereClause += ` AND created_at > $${values.length + 1}`;
      values.push(since.toISOString());
    }

    if (eventTypes && eventTypes.length > 0) {
      whereClause += ` AND event_type = ANY($${values.length + 1})`;
      values.push(eventTypes);
    }

    const result = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM auth_events ${whereClause} ORDER BY created_at DESC LIMIT $${values.length + 1}`,
      [...values, limit]
    );

    return result.rows.map(mapRowToAuthEvent);
  }

  /**
   * Count events by type in a time window
   */
  async countByType(since: Date): Promise<Record<AuthEventType, number>> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT event_type, COUNT(*) as count
       FROM auth_events
       WHERE created_at > $1
       GROUP BY event_type`,
      [since.toISOString()]
    );

    const counts: Partial<Record<AuthEventType, number>> = {};
    for (const row of result.rows) {
      counts[row.event_type as AuthEventType] = parseInt(row.count as string, 10);
    }

    return counts as Record<AuthEventType, number>;
  }

  /**
   * Get suspicious activity (multiple failed logins from different IPs)
   */
  async getSuspiciousActivity(since: Date): Promise<
    Array<{
      email: string;
      failedAttempts: number;
      uniqueIps: number;
    }>
  > {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT
         email,
         COUNT(*) as failed_attempts,
         COUNT(DISTINCT ip_address) as unique_ips
       FROM auth_events
       WHERE event_type = 'login_failure'
         AND created_at > $1
         AND email IS NOT NULL
       GROUP BY email
       HAVING COUNT(*) >= 5 OR COUNT(DISTINCT ip_address) >= 3
       ORDER BY failed_attempts DESC`,
      [since.toISOString()]
    );

    return result.rows.map((row) => ({
      email: row.email as string,
      failedAttempts: parseInt(row.failed_attempts as string, 10),
      uniqueIps: parseInt(row.unique_ips as string, 10),
    }));
  }

  /**
   * Delete old events (data retention)
   */
  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.db.query(
      'DELETE FROM auth_events WHERE created_at < $1',
      [date.toISOString()]
    );

    const count = result.rowCount ?? 0;
    if (count > 0) {
      logger.info({ count, before: date }, 'Old auth events cleaned up');
    }
    return count;
  }
}
