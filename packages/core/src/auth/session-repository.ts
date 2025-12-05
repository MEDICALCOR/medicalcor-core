/**
 * Session Repository
 * Database operations for session management and revocation
 */

import type { DatabasePool } from '../database.js';
import { createLogger, type Logger } from '../logger.js';
import type { Session, CreateSessionData } from './types.js';

const logger: Logger = createLogger({ name: 'session-repository' });

/** Map database row to Session entity */
function mapRowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    tokenHash: row.token_hash as string,
    ipAddress: row.ip_address as string | undefined,
    userAgent: row.user_agent as string | undefined,
    deviceInfo: row.device_info as Record<string, unknown> | undefined,
    expiresAt: new Date(row.expires_at as string),
    revokedAt: row.revoked_at ? new Date(row.revoked_at as string) : undefined,
    revokedReason: row.revoked_reason as string | undefined,
    lastActivityAt: new Date(row.last_activity_at as string),
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Session Repository
 * Handles session management, tracking, and revocation
 */
export class SessionRepository {
  constructor(private db: DatabasePool) {}

  /**
   * Create a new session
   */
  async create(data: CreateSessionData): Promise<Session> {
    const result = await this.db.query(
      `INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, device_info, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.userId,
        data.tokenHash,
        data.ipAddress ?? null,
        data.userAgent ?? null,
        data.deviceInfo ? JSON.stringify(data.deviceInfo) : null,
        data.expiresAt.toISOString(),
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create session');
    }
    logger.debug({ userId: data.userId }, 'Session created');
    return mapRowToSession(row);
  }

  /**
   * Find session by ID
   */
  async findById(id: string): Promise<Session | null> {
    const result = await this.db.query('SELECT * FROM sessions WHERE id = $1', [id]);
    return result.rows[0] ? mapRowToSession(result.rows[0]) : null;
  }

  /**
   * Find session by token hash
   */
  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const result = await this.db.query('SELECT * FROM sessions WHERE token_hash = $1', [tokenHash]);
    return result.rows[0] ? mapRowToSession(result.rows[0]) : null;
  }

  /**
   * Validate session (exists, not expired, not revoked)
   */
  async validate(tokenHash: string): Promise<Session | null> {
    const result = await this.db.query(
      `SELECT * FROM sessions
       WHERE token_hash = $1
         AND expires_at > CURRENT_TIMESTAMP
         AND revoked_at IS NULL`,
      [tokenHash]
    );
    return result.rows[0] ? mapRowToSession(result.rows[0]) : null;
  }

  /**
   * Update last activity timestamp
   */
  async updateActivity(id: string): Promise<void> {
    await this.db.query('UPDATE sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1', [
      id,
    ]);
  }

  /**
   * Revoke a specific session
   */
  async revoke(id: string, reason?: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = $2
       WHERE id = $1 AND revoked_at IS NULL`,
      [id, reason ?? 'manual_revocation']
    );

    if (result.rowCount && result.rowCount > 0) {
      logger.info({ sessionId: id, reason }, 'Session revoked');
      return true;
    }
    return false;
  }

  /**
   * Revoke all sessions for a user (logout everywhere)
   */
  async revokeAllForUser(userId: string, reason?: string): Promise<number> {
    const result = await this.db.query(
      `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = $2
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId, reason ?? 'logout_all']
    );

    const count = result.rowCount ?? 0;
    if (count > 0) {
      logger.info({ userId, count, reason }, 'All user sessions revoked');
    }
    return count;
  }

  /**
   * Revoke all sessions except one (for password change)
   */
  async revokeOthers(userId: string, keepSessionId: string, reason?: string): Promise<number> {
    const result = await this.db.query(
      `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = $3
       WHERE user_id = $1 AND id != $2 AND revoked_at IS NULL`,
      [userId, keepSessionId, reason ?? 'password_changed']
    );

    const count = result.rowCount ?? 0;
    if (count > 0) {
      logger.info({ userId, count, reason }, 'Other sessions revoked');
    }
    return count;
  }

  /**
   * Get active sessions for a user
   */
  async getActiveForUser(userId: string): Promise<Session[]> {
    const result = await this.db.query(
      `SELECT * FROM sessions
       WHERE user_id = $1
         AND expires_at > CURRENT_TIMESTAMP
         AND revoked_at IS NULL
       ORDER BY last_activity_at DESC`,
      [userId]
    );

    return result.rows.map(mapRowToSession);
  }

  /**
   * Count active sessions for a user
   */
  async countActiveForUser(userId: string): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(*) as count FROM sessions
       WHERE user_id = $1
         AND expires_at > CURRENT_TIMESTAMP
         AND revoked_at IS NULL`,
      [userId]
    );

    return parseInt((result.rows[0]?.count ?? '0') as string, 10);
  }

  /**
   * Atomically enforce session limit for a user
   * SECURITY: Uses a single atomic SQL statement to prevent TOCTOU race conditions
   * This revokes the oldest sessions if the user exceeds maxSessions
   */
  async enforceSessionLimit(userId: string, maxSessions: number, reason: string): Promise<number> {
    // Atomic operation: revoke excess sessions in a single query
    // This prevents race conditions where multiple concurrent logins could
    // bypass the session limit by checking count separately from revoking
    const result = await this.db.query(
      `WITH active_sessions AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY last_activity_at DESC) as rn
         FROM sessions
         WHERE user_id = $1
           AND expires_at > CURRENT_TIMESTAMP
           AND revoked_at IS NULL
         FOR UPDATE
       ),
       sessions_to_revoke AS (
         SELECT id FROM active_sessions WHERE rn >= $2
       )
       UPDATE sessions
       SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = $3
       WHERE id IN (SELECT id FROM sessions_to_revoke)
       RETURNING id`,
      [userId, maxSessions, reason]
    );

    const count = result.rowCount ?? 0;
    if (count > 0) {
      logger.info(
        { userId, count, maxSessions, reason },
        'Excess sessions revoked to enforce limit'
      );
    }
    return count;
  }

  /**
   * Delete expired sessions (cleanup)
   */
  async deleteExpired(): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days'`
    );

    const count = result.rowCount ?? 0;
    if (count > 0) {
      logger.info({ count }, 'Expired sessions cleaned up');
    }
    return count;
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    expired: number;
    revoked: number;
  }> {
    const result = await this.db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE expires_at > CURRENT_TIMESTAMP AND revoked_at IS NULL) as active,
        COUNT(*) FILTER (WHERE expires_at <= CURRENT_TIMESTAMP) as expired,
        COUNT(*) FILTER (WHERE revoked_at IS NOT NULL) as revoked
      FROM sessions
    `);

    const row = result.rows[0];
    if (!row) {
      return {
        total: 0,
        active: 0,
        expired: 0,
        revoked: 0,
      };
    }
    return {
      total: parseInt(row.total as string, 10),
      active: parseInt(row.active as string, 10),
      expired: parseInt(row.expired as string, 10),
      revoked: parseInt(row.revoked as string, 10),
    };
  }
}
