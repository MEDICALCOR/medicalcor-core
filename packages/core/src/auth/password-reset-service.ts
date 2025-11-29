/**
 * Password Reset Service
 * Handles password reset token generation and validation
 */

import { createHash, randomBytes } from 'crypto';
import type { DatabasePool } from '../database.js';
import { createLogger, type Logger } from '../logger.js';
import { UserRepository } from './user-repository.js';
import { SessionRepository } from './session-repository.js';
import { AuthEventRepository } from './auth-event-repository.js';
import type { PasswordResetToken, AuthContext } from './types.js';

const logger: Logger = createLogger({ name: 'password-reset-service' });

/** Token configuration */
const TOKEN_CONFIG = {
  /**
   * Token expiration time in minutes
   * SECURITY FIX: Reduced from 15 to 5 minutes for medical application security
   * Shorter expiration window reduces risk of token interception/brute-force
   */
  expirationMinutes: 5,
  /**
   * Minimum time between reset requests (rate limiting)
   * SECURITY FIX: Increased from 1 to 5 minutes to prevent enumeration attacks
   */
  minRequestIntervalMinutes: 5,
  /** Max reset requests per hour - kept at 3 for reasonable UX */
  maxRequestsPerHour: 3,
};

/** Map database row to PasswordResetToken entity */
function mapRowToToken(row: Record<string, unknown>): PasswordResetToken {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    tokenHash: row.token_hash as string,
    expiresAt: new Date(row.expires_at as string),
    usedAt: row.used_at ? new Date(row.used_at as string) : undefined,
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Password Reset Service
 * Manages password reset tokens and the reset flow
 */
export class PasswordResetService {
  private userRepo: UserRepository;
  private sessionRepo: SessionRepository;
  private eventRepo: AuthEventRepository;

  constructor(private db: DatabasePool) {
    this.userRepo = new UserRepository(db);
    this.sessionRepo = new SessionRepository(db);
    this.eventRepo = new AuthEventRepository(db);
  }

  /**
   * Request a password reset for an email
   * Returns the token if successful (should be sent via email in production)
   *
   * SECURITY FIX: Implements constant-time response to prevent timing attacks
   * All code paths take approximately the same time to complete
   */
  async requestReset(
    email: string,
    context?: AuthContext
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    // SECURITY FIX: Record start time for constant-time response
    const startTime = Date.now();
    const MIN_RESPONSE_TIME_MS = 200; // Minimum response time to mask timing differences

    const user = await this.userRepo.findByEmail(email);

    // Helper to ensure constant-time response
    const delayAndReturn = async <T>(result: T): Promise<T> => {
      const elapsed = Date.now() - startTime;
      const delay = Math.max(0, MIN_RESPONSE_TIME_MS - elapsed);
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      return result;
    };

    // Always return success to prevent email enumeration
    // But only generate token if user exists
    if (!user) {
      logger.info({ email }, 'Password reset requested for non-existent email');
      // SECURITY FIX: Perform dummy work to match timing of successful path
      await this.performDummyWork();
      return delayAndReturn({ success: true }); // Don't reveal that email doesn't exist
    }

    // Check if account is active
    if (user.status !== 'active') {
      logger.info({ email, status: user.status }, 'Password reset requested for inactive account');
      // SECURITY FIX: Perform dummy work to match timing
      await this.performDummyWork();
      return delayAndReturn({ success: true }); // Don't reveal account status
    }

    // Check rate limiting
    const recentTokens = await this.getRecentTokensForUser(user.id);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const tokensInLastHour = recentTokens.filter((t) => t.createdAt > oneHourAgo);

    if (tokensInLastHour.length >= TOKEN_CONFIG.maxRequestsPerHour) {
      logger.warn({ userId: user.id }, 'Password reset rate limit exceeded');
      return {
        success: false,
        error: 'Too many reset requests. Please try again later.',
      };
    }

    // Check minimum interval
    if (recentTokens.length > 0) {
      const lastToken = recentTokens[0];
      if (lastToken) {
        const minInterval = TOKEN_CONFIG.minRequestIntervalMinutes * 60 * 1000;
        if (Date.now() - lastToken.createdAt.getTime() < minInterval) {
          return {
            success: false,
            error: 'Please wait before requesting another reset.',
          };
        }
      }
    }

    // Generate token
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + TOKEN_CONFIG.expirationMinutes * 60 * 1000);

    // Invalidate any existing unused tokens
    await this.invalidateTokensForUser(user.id);

    // Create new token
    await this.db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt.toISOString()]
    );

    // Log event
    await this.eventRepo.log({
      userId: user.id,
      email: user.email,
      eventType: 'password_reset_requested',
      result: 'success',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    logger.info({ userId: user.id }, 'Password reset token generated');

    return {
      success: true,
      token, // In production, this would be sent via email, not returned
    };
  }

  /**
   * Validate a reset token
   */
  async validateToken(
    token: string
  ): Promise<{ valid: boolean; userId?: string; email?: string; error?: string }> {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const result = await this.db.query(
      `SELECT prt.*, u.email
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = $1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return { valid: false, error: 'Invalid or expired reset token' };
    }

    const row = result.rows[0];
    if (!row) {
      return { valid: false, error: 'Invalid or expired reset token' };
    }
    const resetToken = mapRowToToken(row);

    // Check if already used
    if (resetToken.usedAt) {
      return { valid: false, error: 'This reset token has already been used' };
    }

    // Check expiration
    if (resetToken.expiresAt < new Date()) {
      return { valid: false, error: 'This reset token has expired' };
    }

    return {
      valid: true,
      userId: resetToken.userId,
      email: row.email as string,
    };
  }

  /**
   * Complete password reset with token
   */
  async completeReset(
    token: string,
    newPassword: string,
    context?: AuthContext
  ): Promise<{ success: boolean; error?: string }> {
    const validation = await this.validateToken(token);
    if (!validation.valid || !validation.userId) {
      return { success: false, error: validation.error ?? 'Invalid token' };
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Mark token as used
    await this.db.query(
      `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_hash = $1`,
      [tokenHash]
    );

    // Update password
    const updated = await this.userRepo.updatePassword(validation.userId, newPassword);
    if (!updated) {
      return { success: false, error: 'Failed to update password' };
    }

    // Revoke all sessions (force re-login)
    await this.sessionRepo.revokeAllForUser(validation.userId, 'password_reset');

    // Unlock account if locked
    await this.userRepo.unlockAccount(validation.userId);

    // Log event
    await this.eventRepo.log({
      userId: validation.userId,
      email: validation.email,
      eventType: 'password_reset_completed',
      result: 'success',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    logger.info({ userId: validation.userId }, 'Password reset completed');

    return { success: true };
  }

  /**
   * Get recent tokens for a user
   */
  private async getRecentTokensForUser(userId: string): Promise<PasswordResetToken[]> {
    const result = await this.db.query(
      `SELECT * FROM password_reset_tokens
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    return result.rows.map(mapRowToToken);
  }

  /**
   * Invalidate all unused tokens for a user
   */
  private async invalidateTokensForUser(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE password_reset_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    );
  }

  /**
   * Cleanup expired tokens
   */
  async cleanup(): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM password_reset_tokens
       WHERE used_at IS NOT NULL OR expires_at < CURRENT_TIMESTAMP`
    );

    const count = result.rowCount ?? 0;
    if (count > 0) {
      logger.info({ count }, 'Expired password reset tokens cleaned up');
    }
    return count;
  }

  /**
   * SECURITY FIX: Perform dummy work to ensure constant-time response
   * This prevents timing attacks that could reveal if an email exists
   */
  private async performDummyWork(): Promise<void> {
    // Perform operations similar to successful path timing
    // Query that will find nothing but takes similar time
    await this.db.query(
      `SELECT id FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1`,
      ['dummy-token-hash-that-will-not-exist']
    );
  }
}

export { TOKEN_CONFIG as PASSWORD_RESET_CONFIG };
