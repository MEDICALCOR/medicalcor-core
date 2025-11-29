/**
 * User Repository
 * Database operations for user management
 */

import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import type { DatabasePool } from '../database.js';
import { createLogger, type Logger } from '../logger.js';
import type {
  User,
  SafeUser,
  CreateUserData,
  UpdateUserData,
  UserRole,
  UserStatus,
} from './types.js';

const logger: Logger = createLogger({ name: 'user-repository' });

/** bcrypt cost factor for password hashing */
const BCRYPT_COST = 12;

/** Map database row to User entity */
function mapRowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    passwordHash: row.password_hash as string,
    name: row.name as string,
    role: row.role as UserRole,
    clinicId: row.clinic_id as string | undefined,
    status: row.status as UserStatus,
    emailVerified: row.email_verified as boolean,
    emailVerifiedAt: row.email_verified_at ? new Date(row.email_verified_at as string) : undefined,
    failedLoginAttempts: row.failed_login_attempts as number,
    lockedUntil: row.locked_until ? new Date(row.locked_until as string) : undefined,
    passwordChangedAt: row.password_changed_at
      ? new Date(row.password_changed_at as string)
      : undefined,
    mustChangePassword: row.must_change_password as boolean,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at as string) : undefined,
    lastLoginIp: row.last_login_ip as string | undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/** Convert User to SafeUser (without sensitive data) */
export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    clinicId: user.clinicId,
    status: user.status,
    emailVerified: user.emailVerified,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

/**
 * User Repository
 * Handles all user-related database operations
 */
export class UserRepository {
  constructor(private db: DatabasePool) {}

  /**
   * Find user by ID
   * CRITICAL FIX: Added soft delete filter for GDPR compliance
   */
  async findById(id: string): Promise<User | null> {
    const result = await this.db.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [
      id,
    ]);
    return result.rows[0] ? mapRowToUser(result.rows[0]) : null;
  }

  /**
   * Find user by email (case-insensitive)
   * CRITICAL FIX: Added soft delete filter for GDPR compliance
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL',
      [email]
    );
    return result.rows[0] ? mapRowToUser(result.rows[0]) : null;
  }

  /**
   * Create a new user
   */
  async create(data: CreateUserData): Promise<User> {
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST);

    const result = await this.db.query(
      `INSERT INTO users (email, password_hash, name, role, clinic_id, status, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.email.toLowerCase(),
        passwordHash,
        data.name,
        data.role,
        data.clinicId ?? null,
        data.status ?? 'active',
        data.emailVerified ?? false,
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create user');
    }
    logger.info({ email: data.email, role: data.role }, 'User created');
    return mapRowToUser(row);
  }

  /**
   * Update user
   * CRITICAL FIX: Added soft delete filter for GDPR compliance
   */
  async update(id: string, data: UpdateUserData): Promise<User | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.email !== undefined) {
      setClauses.push(`email = $${paramIndex++}`);
      values.push(data.email.toLowerCase());
    }
    if (data.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.role !== undefined) {
      setClauses.push(`role = $${paramIndex++}`);
      values.push(data.role);
    }
    if (data.clinicId !== undefined) {
      setClauses.push(`clinic_id = $${paramIndex++}`);
      values.push(data.clinicId);
    }
    if (data.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }
    if (data.emailVerified !== undefined) {
      setClauses.push(`email_verified = $${paramIndex++}`);
      values.push(data.emailVerified);
      if (data.emailVerified) {
        setClauses.push(`email_verified_at = CURRENT_TIMESTAMP`);
      }
    }
    if (data.mustChangePassword !== undefined) {
      setClauses.push(`must_change_password = $${paramIndex++}`);
      values.push(data.mustChangePassword);
    }

    if (setClauses.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = await this.db.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
      values
    );

    if (result.rows[0]) {
      logger.info({ userId: id }, 'User updated');
      return mapRowToUser(result.rows[0]);
    }
    return null;
  }

  /**
   * Update password
   * CRITICAL FIX: Added soft delete filter for GDPR compliance
   */
  async updatePassword(id: string, newPassword: string): Promise<boolean> {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

    const result = await this.db.query(
      `UPDATE users SET
        password_hash = $1,
        password_changed_at = CURRENT_TIMESTAMP,
        must_change_password = FALSE,
        failed_login_attempts = 0,
        locked_until = NULL
       WHERE id = $2 AND deleted_at IS NULL`,
      [passwordHash, id]
    );

    if (result.rowCount && result.rowCount > 0) {
      logger.info({ userId: id }, 'Password updated');
      return true;
    }
    return false;
  }

  /**
   * Verify password against stored hash
   */
  async verifyPassword(user: User, password: string): Promise<boolean> {
    return await bcrypt.compare(password, user.passwordHash);
  }

  /**
   * Increment failed login attempts
   * SECURITY FIX: Properly handle lockout timer - only set new lockout if not already locked
   * This prevents indefinite lockout from repeated attempts
   */
  async incrementFailedAttempts(id: string): Promise<{ attempts: number; lockedUntil?: Date }> {
    const result = await this.db.query(
      `UPDATE users SET
        failed_login_attempts = failed_login_attempts + 1,
        locked_until = CASE
          -- SECURITY FIX: Only set new lockout if:
          -- 1. We've reached the threshold (5 attempts including this one)
          -- 2. Account is not currently locked (prevents extending lockout indefinitely)
          WHEN failed_login_attempts >= 4 AND (locked_until IS NULL OR locked_until < CURRENT_TIMESTAMP)
            THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes'
          -- Keep existing lockout if still active
          WHEN locked_until > CURRENT_TIMESTAMP
            THEN locked_until
          -- Otherwise no lockout
          ELSE NULL
        END
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING failed_login_attempts, locked_until`,
      [id]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to increment login attempts');
    }
    const response: { attempts: number; lockedUntil?: Date } = {
      attempts: row.failed_login_attempts as number,
    };
    if (row.locked_until) {
      response.lockedUntil = new Date(row.locked_until as string);
    }
    return response;
  }

  /**
   * Reset failed login attempts after successful login
   * CRITICAL FIX: Added soft delete filter for GDPR compliance
   */
  async resetFailedAttempts(id: string): Promise<void> {
    await this.db.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
  }

  /**
   * Update last login info
   * CRITICAL FIX: Added soft delete filter for GDPR compliance
   */
  async updateLastLogin(id: string, ipAddress?: string): Promise<void> {
    await this.db.query(
      `UPDATE users SET last_login_at = CURRENT_TIMESTAMP, last_login_ip = $2 WHERE id = $1 AND deleted_at IS NULL`,
      [id, ipAddress ?? null]
    );
  }

  /**
   * Check if account is locked
   * CRITICAL FIX: Added soft delete filter for GDPR compliance
   */
  async isAccountLocked(id: string): Promise<{ locked: boolean; until?: Date }> {
    const result = await this.db.query(
      `SELECT locked_until FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (!result.rows[0]) {
      return { locked: false };
    }

    const lockedUntil = result.rows[0].locked_until;
    if (!lockedUntil) {
      return { locked: false };
    }

    const lockDate = new Date(lockedUntil as string);
    if (lockDate > new Date()) {
      return { locked: true, until: lockDate };
    }

    return { locked: false };
  }

  /**
   * Unlock account manually
   * CRITICAL FIX: Added soft delete filter for GDPR compliance
   */
  async unlockAccount(id: string): Promise<void> {
    await this.db.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    logger.info({ userId: id }, 'Account unlocked');
  }

  /**
   * Delete user (soft delete for GDPR compliance)
   * CRITICAL FIX: Changed from hard delete to soft delete for GDPR right-to-be-forgotten
   * Data will be permanently purged after 90-day retention period
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      'UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (result.rowCount && result.rowCount > 0) {
      logger.info({ userId: id }, 'User soft-deleted (90-day retention before permanent deletion)');
      return true;
    }
    return false;
  }

  /**
   * Permanently delete user (hard delete) - ADMIN ONLY
   * Use with caution - this permanently removes all user data
   * Should only be called after retention period or by explicit admin request
   */
  async hardDelete(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM users WHERE id = $1', [id]);
    if (result.rowCount && result.rowCount > 0) {
      logger.warn({ userId: id }, 'User permanently deleted (hard delete)');
      return true;
    }
    return false;
  }

  /**
   * List users with pagination
   * CRITICAL FIX: Added soft delete filter for GDPR compliance
   */
  async list(options?: {
    limit?: number;
    offset?: number;
    status?: UserStatus;
    role?: UserRole;
    clinicId?: string;
  }): Promise<{ users: SafeUser[]; total: number }> {
    const { limit = 50, offset = 0, status, role, clinicId } = options ?? {};

    const whereClauses: string[] = ['deleted_at IS NULL']; // CRITICAL FIX: Always filter deleted
    const values: unknown[] = [];
    let paramIndex = 1;

    if (status) {
      whereClauses.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (role) {
      whereClauses.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (clinicId) {
      whereClauses.push(`clinic_id = $${paramIndex++}`);
      values.push(clinicId);
    }

    const whereClause = `WHERE ${whereClauses.join(' AND ')}`;

    const [countResult, dataResult] = await Promise.all([
      this.db.query(`SELECT COUNT(*) as count FROM users ${whereClause}`, values),
      this.db.query(
        `SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        [...values, limit, offset]
      ),
    ]);

    return {
      users: dataResult.rows.map((row) => toSafeUser(mapRowToUser(row))),
      total: parseInt((countResult.rows[0]?.count ?? '0') as string, 10),
    };
  }

  /**
   * Search users by name or email
   * SECURITY FIX: Escape LIKE special characters to prevent LIKE injection
   * CRITICAL FIX: Added soft delete filter for GDPR compliance
   */
  async search(query: string, limit = 20): Promise<SafeUser[]> {
    // SECURITY: Escape LIKE pattern special characters to prevent injection
    // The characters % and _ have special meaning in LIKE patterns
    const escapedQuery = query
      .toLowerCase()
      .replace(/\\/g, '\\\\') // Escape backslashes first
      .replace(/%/g, '\\%') // Escape percent signs
      .replace(/_/g, '\\_'); // Escape underscores

    const result = await this.db.query(
      `SELECT * FROM users
       WHERE deleted_at IS NULL AND (LOWER(name) LIKE $1 ESCAPE '\\' OR LOWER(email) LIKE $1 ESCAPE '\\')
       ORDER BY name ASC
       LIMIT $2`,
      [`%${escapedQuery}%`, limit]
    );

    return result.rows.map((row) => toSafeUser(mapRowToUser(row)));
  }

  /**
   * Count users by status
   * CRITICAL FIX: Added soft delete filter for GDPR compliance
   */
  async countByStatus(): Promise<Record<UserStatus, number>> {
    const result = await this.db.query(
      `SELECT status, COUNT(*) as count FROM users WHERE deleted_at IS NULL GROUP BY status`
    );

    const counts: Record<UserStatus, number> = {
      active: 0,
      inactive: 0,
      suspended: 0,
      pending_verification: 0,
    };

    for (const row of result.rows) {
      counts[row.status as UserStatus] = parseInt(row.count as string, 10);
    }

    return counts;
  }

  /**
   * Generate a secure random token
   */
  static generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Hash a token for storage
   */
  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
