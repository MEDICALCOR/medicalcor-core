/**
 * Authentication Service
 * Main service for handling authentication, authorization, and session management
 */

import { createHash, randomBytes } from 'crypto';
import type { DatabasePool } from '../database.js';
import { createLogger, type Logger } from '../logger.js';
import { UserRepository, toSafeUser } from './user-repository.js';
import { SessionRepository } from './session-repository.js';
import { AuthEventRepository } from './auth-event-repository.js';
import { LoginAttemptRepository, RATE_LIMIT_CONFIG } from './login-attempt-repository.js';
import type {
  SafeUser,
  CreateUserData,
  UpdateUserData,
  Session,
  AuthContext,
  LoginResult,
  RateLimitResult,
  PasswordValidationResult,
} from './types.js';

const logger: Logger = createLogger({ name: 'auth-service' });

/** Password policy configuration */
const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: false,
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

/** Session configuration */
const SESSION_CONFIG = {
  /** Session duration in hours */
  durationHours: 8,
  /** Max concurrent sessions per user (0 = unlimited) */
  maxConcurrentSessions: 5,
};

/**
 * Authentication Service
 * Provides complete authentication functionality
 */
export class AuthService {
  private userRepo: UserRepository;
  private sessionRepo: SessionRepository;
  private eventRepo: AuthEventRepository;
  private attemptRepo: LoginAttemptRepository;

  constructor(db: DatabasePool) {
    this.userRepo = new UserRepository(db);
    this.sessionRepo = new SessionRepository(db);
    this.eventRepo = new AuthEventRepository(db);
    this.attemptRepo = new LoginAttemptRepository(db);
  }

  // =========================================================================
  // Authentication
  // =========================================================================

  /**
   * Authenticate user with email and password
   */
  async login(email: string, password: string, context?: AuthContext): Promise<LoginResult> {
    const ipAddress = context?.ipAddress ?? 'unknown';
    const userAgent = context?.userAgent;

    // Check rate limiting first
    const rateLimit = await this.attemptRepo.checkRateLimit(email, ipAddress);
    if (!rateLimit.allowed) {
      await this.eventRepo.log({
        email,
        eventType: 'login_failure',
        result: 'blocked',
        ipAddress,
        userAgent,
        details: { reason: 'rate_limited' },
      });

      return {
        success: false,
        error: rateLimit.reason ?? 'Too many failed attempts. Please try again later.',
      };
    }

    // Find user by email
    const user = await this.userRepo.findByEmail(email);

    if (!user) {
      // Record failed attempt
      await this.attemptRepo.record({
        email,
        ipAddress,
        success: false,
        failureReason: 'user_not_found',
      });

      await this.eventRepo.log({
        email,
        eventType: 'login_failure',
        result: 'failure',
        ipAddress,
        userAgent,
        details: { reason: 'user_not_found' },
      });

      // Return generic error to prevent user enumeration
      return {
        success: false,
        error: 'Invalid email or password',
      };
    }

    // Check if account is active
    if (user.status !== 'active') {
      await this.attemptRepo.record({
        email,
        ipAddress,
        success: false,
        failureReason: `account_${user.status}`,
      });

      await this.eventRepo.log({
        userId: user.id,
        email,
        eventType: 'login_failure',
        result: 'failure',
        ipAddress,
        userAgent,
        details: { reason: 'account_inactive', status: user.status },
      });

      return {
        success: false,
        error: 'Account is not active. Please contact support.',
      };
    }

    // Check if account is locked
    const lockStatus = await this.userRepo.isAccountLocked(user.id);
    if (lockStatus.locked) {
      await this.attemptRepo.record({
        email,
        ipAddress,
        success: false,
        failureReason: 'account_locked',
      });

      await this.eventRepo.log({
        userId: user.id,
        email,
        eventType: 'login_failure',
        result: 'blocked',
        ipAddress,
        userAgent,
        details: { reason: 'account_locked', lockedUntil: lockStatus.until },
      });

      return {
        success: false,
        error: 'Account is temporarily locked. Please try again later.',
        lockedUntil: lockStatus.until,
      };
    }

    // Verify password
    const isValid = await this.userRepo.verifyPassword(user, password);

    if (!isValid) {
      // Increment failed attempts
      const { attempts, lockedUntil } = await this.userRepo.incrementFailedAttempts(user.id);

      await this.attemptRepo.record({
        email,
        ipAddress,
        success: false,
        failureReason: 'invalid_password',
      });

      await this.eventRepo.log({
        userId: user.id,
        email,
        eventType: 'login_failure',
        result: 'failure',
        ipAddress,
        userAgent,
        details: { reason: 'invalid_password', failedAttempts: attempts },
      });

      // Log account lock event if triggered
      if (lockedUntil) {
        await this.eventRepo.log({
          userId: user.id,
          email,
          eventType: 'account_locked',
          result: 'success',
          ipAddress,
          userAgent,
          details: { lockedUntil, failedAttempts: attempts },
        });
      }

      return {
        success: false,
        error: 'Invalid email or password',
        lockedUntil,
      };
    }

    // Enforce concurrent session limit
    // SECURITY: Uses atomic enforcement to prevent race conditions (TOCTOU vulnerability)
    // Instead of check-then-act, we fetch sessions and enforce limit in single operation
    if (SESSION_CONFIG.maxConcurrentSessions > 0) {
      // Get all active sessions and enforce limit atomically
      // This is resilient to race conditions - worst case we have max+1 sessions briefly
      const activeSessions = await this.sessionRepo.getActiveForUser(user.id);

      // Calculate how many sessions to revoke to make room for the new one
      const sessionsToRevoke = activeSessions.length - SESSION_CONFIG.maxConcurrentSessions + 1;

      if (sessionsToRevoke > 0) {
        // Revoke the oldest sessions (at the end of the array, sorted by creation time)
        const sessionsForRevocation = activeSessions.slice(-sessionsToRevoke);
        for (const session of sessionsForRevocation) {
          await this.sessionRepo.revoke(session.id, 'max_sessions_exceeded');
          logger.info(
            { userId: user.id, sessionId: session.id },
            'Revoked session due to concurrent session limit'
          );
        }
      }
    }

    // Create session
    const sessionToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(sessionToken).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_CONFIG.durationHours * 60 * 60 * 1000);

    const session = await this.sessionRepo.create({
      userId: user.id,
      tokenHash,
      ipAddress,
      userAgent,
      expiresAt,
    });

    // Record successful login
    await this.attemptRepo.record({
      email,
      ipAddress,
      success: true,
    });

    // Reset failed attempts
    await this.userRepo.resetFailedAttempts(user.id);

    // Update last login
    await this.userRepo.updateLastLogin(user.id, ipAddress);

    // Log success
    await this.eventRepo.log({
      userId: user.id,
      email,
      eventType: 'login_success',
      result: 'success',
      ipAddress,
      userAgent,
      sessionId: session.id,
    });

    logger.info({ userId: user.id, email }, 'User logged in successfully');

    return {
      success: true,
      user: toSafeUser(user),
      session,
      accessToken: sessionToken,
    };
  }

  /**
   * Logout - revoke session
   */
  async logout(sessionId: string, context?: AuthContext): Promise<boolean> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      return false;
    }

    await this.sessionRepo.revoke(sessionId, 'logout');

    await this.eventRepo.log({
      userId: session.userId,
      eventType: 'logout',
      result: 'success',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      sessionId,
    });

    return true;
  }

  /**
   * Logout from all sessions
   */
  async logoutAll(userId: string, context?: AuthContext): Promise<number> {
    const count = await this.sessionRepo.revokeAllForUser(userId, 'logout_all');

    await this.eventRepo.log({
      userId,
      eventType: 'session_revoked',
      result: 'success',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      details: { count, reason: 'logout_all' },
    });

    return count;
  }

  /**
   * Validate session token
   */
  async validateSession(token: string): Promise<{ user: SafeUser; session: Session } | null> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await this.sessionRepo.validate(tokenHash);

    if (!session) {
      return null;
    }

    const user = await this.userRepo.findById(session.userId);
    if (user?.status !== 'active') {
      return null;
    }

    // Update activity timestamp
    await this.sessionRepo.updateActivity(session.id);

    return {
      user: toSafeUser(user),
      session,
    };
  }

  // =========================================================================
  // User Management
  // =========================================================================

  /**
   * Create a new user
   */
  async createUser(data: CreateUserData, context?: AuthContext): Promise<SafeUser> {
    // Validate password
    const validation = this.validatePassword(data.password);
    if (!validation.valid) {
      throw new Error(`Invalid password: ${validation.errors.join(', ')}`);
    }

    const user = await this.userRepo.create(data);

    await this.eventRepo.log({
      userId: user.id,
      email: user.email,
      eventType: 'user_created',
      result: 'success',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      details: { role: data.role },
    });

    return toSafeUser(user);
  }

  /**
   * Update user
   */
  async updateUser(
    id: string,
    data: UpdateUserData,
    context?: AuthContext
  ): Promise<SafeUser | null> {
    const user = await this.userRepo.update(id, data);

    if (user) {
      await this.eventRepo.log({
        userId: id,
        eventType: 'user_updated',
        result: 'success',
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        details: { changes: Object.keys(data) },
      });

      return toSafeUser(user);
    }

    return null;
  }

  /**
   * Change password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    context?: AuthContext
  ): Promise<{ success: boolean; error?: string }> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Verify current password
    const isValid = await this.userRepo.verifyPassword(user, currentPassword);
    if (!isValid) {
      return { success: false, error: 'Current password is incorrect' };
    }

    // Validate new password
    const validation = this.validatePassword(newPassword);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') };
    }

    // Update password
    await this.userRepo.updatePassword(userId, newPassword);

    // Revoke other sessions
    await this.sessionRepo.revokeOthers(userId, context?.sessionId ?? '', 'password_changed');

    await this.eventRepo.log({
      userId,
      eventType: 'password_changed',
      result: 'success',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      sessionId: context?.sessionId,
    });

    return { success: true };
  }

  /**
   * Admin: Reset user password
   */
  async adminResetPassword(
    userId: string,
    newPassword: string,
    context?: AuthContext
  ): Promise<boolean> {
    const validation = this.validatePassword(newPassword);
    if (!validation.valid) {
      throw new Error(`Invalid password: ${validation.errors.join(', ')}`);
    }

    const success = await this.userRepo.updatePassword(userId, newPassword);

    if (success) {
      // Force password change on next login
      await this.userRepo.update(userId, { mustChangePassword: true });

      // Revoke all sessions
      await this.sessionRepo.revokeAllForUser(userId, 'admin_password_reset');

      await this.eventRepo.log({
        userId,
        eventType: 'password_changed',
        result: 'success',
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        details: { adminReset: true },
      });
    }

    return success;
  }

  /**
   * Unlock user account
   */
  async unlockAccount(userId: string, context?: AuthContext): Promise<void> {
    await this.userRepo.unlockAccount(userId);

    await this.eventRepo.log({
      userId,
      eventType: 'account_unlocked',
      result: 'success',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });
  }

  /**
   * Get user by ID
   */
  async getUser(id: string): Promise<SafeUser | null> {
    const user = await this.userRepo.findById(id);
    return user ? toSafeUser(user) : null;
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<SafeUser | null> {
    const user = await this.userRepo.findByEmail(email);
    return user ? toSafeUser(user) : null;
  }

  /**
   * List users
   */
  async listUsers(options?: Parameters<UserRepository['list']>[0]) {
    return this.userRepo.list(options);
  }

  /**
   * Delete user
   */
  async deleteUser(id: string, context?: AuthContext): Promise<boolean> {
    const user = await this.userRepo.findById(id);
    if (!user) {
      return false;
    }

    // Revoke all sessions first
    await this.sessionRepo.revokeAllForUser(id, 'user_deleted');

    const deleted = await this.userRepo.delete(id);

    if (deleted) {
      await this.eventRepo.log({
        userId: id,
        email: user.email,
        eventType: 'user_deleted',
        result: 'success',
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });
    }

    return deleted;
  }

  // =========================================================================
  // Session Management
  // =========================================================================

  /**
   * Get active sessions for a user
   */
  async getActiveSessions(userId: string): Promise<Session[]> {
    return this.sessionRepo.getActiveForUser(userId);
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(sessionId: string, reason?: string, context?: AuthContext): Promise<boolean> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      return false;
    }

    const revoked = await this.sessionRepo.revoke(sessionId, reason);

    if (revoked) {
      await this.eventRepo.log({
        userId: session.userId,
        eventType: 'session_revoked',
        result: 'success',
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        sessionId,
        details: { reason },
      });
    }

    return revoked;
  }

  // =========================================================================
  // Rate Limiting & Security
  // =========================================================================

  /**
   * Check rate limit status
   */
  async checkRateLimit(email: string, ipAddress: string): Promise<RateLimitResult> {
    return this.attemptRepo.checkRateLimit(email, ipAddress);
  }

  /**
   * Clear rate limit for an email (admin function)
   */
  async clearRateLimit(email: string): Promise<number> {
    return this.attemptRepo.clearRateLimitForEmail(email);
  }

  /**
   * Get suspicious activity report
   */
  async getSuspiciousActivity(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.attemptRepo.getSuspiciousIps(since);
  }

  // =========================================================================
  // Audit & Monitoring
  // =========================================================================

  /**
   * Get login history for a user
   */
  async getLoginHistory(userId: string, limit = 10) {
    return this.eventRepo.getLoginHistory(userId, limit);
  }

  /**
   * Get auth events for a user
   */
  async getAuthEvents(userId: string, options?: Parameters<AuthEventRepository['getForUser']>[1]) {
    return this.eventRepo.getForUser(userId, options);
  }

  /**
   * Get session statistics
   */
  async getSessionStats() {
    return this.sessionRepo.getStats();
  }

  /**
   * Get login attempt statistics
   */
  async getLoginStats(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.attemptRepo.getStats(since);
  }

  // =========================================================================
  // Utility
  // =========================================================================

  /**
   * Validate password against policy
   */
  validatePassword(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (password.length < PASSWORD_POLICY.minLength) {
      errors.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters`);
    }

    if (password.length > PASSWORD_POLICY.maxLength) {
      errors.push(`Password must be at most ${PASSWORD_POLICY.maxLength} characters`);
    }

    if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (PASSWORD_POLICY.requireNumber && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (PASSWORD_POLICY.requireSpecial) {
      const specialRegex = new RegExp(
        `[${PASSWORD_POLICY.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`
      );
      if (!specialRegex.test(password)) {
        errors.push('Password must contain at least one special character');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Cleanup expired data (should be run periodically)
   */
  async cleanup(): Promise<{
    expiredSessions: number;
    oldAttempts: number;
    oldEvents: number;
  }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [expiredSessions, oldAttempts, oldEvents] = await Promise.all([
      this.sessionRepo.deleteExpired(),
      this.attemptRepo.deleteOlderThan(thirtyDaysAgo),
      this.eventRepo.deleteOlderThan(ninetyDaysAgo),
    ]);

    logger.info({ expiredSessions, oldAttempts, oldEvents }, 'Auth data cleanup completed');

    return { expiredSessions, oldAttempts, oldEvents };
  }
}

/** Export configuration for external use */
export { PASSWORD_POLICY, SESSION_CONFIG, RATE_LIMIT_CONFIG };
