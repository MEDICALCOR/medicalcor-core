/**
 * Login Attempt Repository
 * Tracks login attempts for brute force protection
 */

import type { DatabasePool } from '../database.js';
import { createLogger, type Logger } from '../logger.js';
import type { LoginAttempt, RateLimitResult } from './types.js';

const logger: Logger = createLogger({ name: 'login-attempt-repository' });

/** Rate limit configuration */
const RATE_LIMIT_CONFIG = {
  /** Maximum failed attempts per email in the time window */
  maxFailedAttemptsPerEmail: 5,
  /** Maximum failed attempts per IP in the time window */
  maxFailedAttemptsPerIp: 20,
  /** Time window for rate limiting (in minutes) */
  windowMinutes: 15,
  /** Lockout duration after max attempts (in minutes) */
  lockoutMinutes: 30,
};

/** Map database row to LoginAttempt entity */
function mapRowToLoginAttempt(row: Record<string, unknown>): LoginAttempt {
  return {
    id: row.id as string,
    email: row.email as string,
    ipAddress: row.ip_address as string,
    success: row.success as boolean,
    failureReason: row.failure_reason as string | undefined,
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Login Attempt Repository
 * Tracks and rate-limits login attempts for brute force protection
 */
export class LoginAttemptRepository {
  constructor(private db: DatabasePool) {}

  /**
   * Record a login attempt
   */
  async record(data: {
    email: string;
    ipAddress: string;
    success: boolean;
    failureReason?: string;
  }): Promise<LoginAttempt> {
    const result = await this.db.query<Record<string, unknown>>(
      `INSERT INTO login_attempts (email, ip_address, success, failure_reason)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.email.toLowerCase(), data.ipAddress, data.success, data.failureReason ?? null]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create login attempt');
    }
    return mapRowToLoginAttempt(row);
  }

  /**
   * Check if login is allowed (rate limiting)
   */
  async checkRateLimit(email: string, ipAddress: string): Promise<RateLimitResult> {
    const windowStart = new Date(Date.now() - RATE_LIMIT_CONFIG.windowMinutes * 60 * 1000);

    // Check failed attempts for this email
    const emailResult = await this.db.query<Record<string, unknown>>(
      `SELECT COUNT(*) as count FROM login_attempts
       WHERE LOWER(email) = LOWER($1) AND success = FALSE AND created_at > $2`,
      [email, windowStart.toISOString()]
    );
    const emailFailedCount = parseInt((emailResult.rows[0]?.count as string) ?? '0', 10);

    // Check failed attempts from this IP
    const ipResult = await this.db.query<Record<string, unknown>>(
      `SELECT COUNT(*) as count FROM login_attempts
       WHERE ip_address = $1 AND success = FALSE AND created_at > $2`,
      [ipAddress, windowStart.toISOString()]
    );
    const ipFailedCount = parseInt((ipResult.rows[0]?.count as string) ?? '0', 10);

    // Calculate reset time
    const resetAt = new Date(Date.now() + RATE_LIMIT_CONFIG.lockoutMinutes * 60 * 1000);

    // Check email rate limit
    if (emailFailedCount >= RATE_LIMIT_CONFIG.maxFailedAttemptsPerEmail) {
      logger.warn({ email, failedCount: emailFailedCount }, 'Email rate limit exceeded');
      return {
        allowed: false,
        remainingAttempts: 0,
        resetAt,
        reason: 'Too many failed attempts for this email. Please try again later.',
      };
    }

    // Check IP rate limit
    if (ipFailedCount >= RATE_LIMIT_CONFIG.maxFailedAttemptsPerIp) {
      logger.warn({ ipAddress, failedCount: ipFailedCount }, 'IP rate limit exceeded');
      return {
        allowed: false,
        remainingAttempts: 0,
        resetAt,
        reason: 'Too many failed attempts from this IP. Please try again later.',
      };
    }

    return {
      allowed: true,
      remainingAttempts:
        RATE_LIMIT_CONFIG.maxFailedAttemptsPerEmail - emailFailedCount,
    };
  }

  /**
   * Get recent attempts for an email
   */
  async getRecentForEmail(email: string, limit = 10): Promise<LoginAttempt[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM login_attempts
       WHERE LOWER(email) = LOWER($1)
       ORDER BY created_at DESC
       LIMIT $2`,
      [email, limit]
    );

    return result.rows.map(mapRowToLoginAttempt);
  }

  /**
   * Get recent attempts from an IP
   */
  async getRecentForIp(ipAddress: string, limit = 10): Promise<LoginAttempt[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM login_attempts
       WHERE ip_address = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [ipAddress, limit]
    );

    return result.rows.map(mapRowToLoginAttempt);
  }

  /**
   * Get IPs with high failure rates (potential attackers)
   */
  async getSuspiciousIps(since: Date, minFailures = 10): Promise<
    Array<{
      ipAddress: string;
      totalAttempts: number;
      failedAttempts: number;
      uniqueEmails: number;
    }>
  > {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT
         ip_address,
         COUNT(*) as total_attempts,
         COUNT(*) FILTER (WHERE success = FALSE) as failed_attempts,
         COUNT(DISTINCT email) as unique_emails
       FROM login_attempts
       WHERE created_at > $1
       GROUP BY ip_address
       HAVING COUNT(*) FILTER (WHERE success = FALSE) >= $2
       ORDER BY failed_attempts DESC`,
      [since.toISOString(), minFailures]
    );

    return result.rows.map((row) => ({
      ipAddress: row.ip_address as string,
      totalAttempts: parseInt(row.total_attempts as string, 10),
      failedAttempts: parseInt(row.failed_attempts as string, 10),
      uniqueEmails: parseInt(row.unique_emails as string, 10),
    }));
  }

  /**
   * Get statistics for monitoring
   */
  async getStats(since: Date): Promise<{
    total: number;
    successful: number;
    failed: number;
    uniqueEmails: number;
    uniqueIps: number;
  }> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE success = TRUE) as successful,
         COUNT(*) FILTER (WHERE success = FALSE) as failed,
         COUNT(DISTINCT email) as unique_emails,
         COUNT(DISTINCT ip_address) as unique_ips
       FROM login_attempts
       WHERE created_at > $1`,
      [since.toISOString()]
    );

    const row = result.rows[0];
    if (!row) {
      return {
        total: 0,
        successful: 0,
        failed: 0,
        uniqueEmails: 0,
        uniqueIps: 0,
      };
    }
    return {
      total: parseInt(row.total as string, 10),
      successful: parseInt(row.successful as string, 10),
      failed: parseInt(row.failed as string, 10),
      uniqueEmails: parseInt(row.unique_emails as string, 10),
      uniqueIps: parseInt(row.unique_ips as string, 10),
    };
  }

  /**
   * Clean up old attempts (data retention)
   */
  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.db.query(
      'DELETE FROM login_attempts WHERE created_at < $1',
      [date.toISOString()]
    );

    const count = result.rowCount ?? 0;
    if (count > 0) {
      logger.info({ count, before: date }, 'Old login attempts cleaned up');
    }
    return count;
  }

  /**
   * Clear rate limit for an email (admin function)
   */
  async clearRateLimitForEmail(email: string): Promise<number> {
    const windowStart = new Date(Date.now() - RATE_LIMIT_CONFIG.windowMinutes * 60 * 1000);

    const result = await this.db.query(
      `DELETE FROM login_attempts
       WHERE LOWER(email) = LOWER($1) AND success = FALSE AND created_at > $2`,
      [email, windowStart.toISOString()]
    );

    const count = result.rowCount ?? 0;
    if (count > 0) {
      logger.info({ email, count }, 'Rate limit cleared for email');
    }
    return count;
  }
}

/** Export rate limit configuration for use in other modules */
export { RATE_LIMIT_CONFIG };
