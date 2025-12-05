/**
 * User Repository Tests
 * Comprehensive tests for user management and database operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserRepository, toSafeUser } from '../user-repository.js';
import type { DatabasePool } from '../../database.js';
import type { User } from '../types.js';

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

// Sample user data
const sampleUser = {
  id: 'user-123',
  email: 'test@example.com',
  password_hash: '$2a$12$test',
  name: 'Test User',
  role: 'doctor',
  clinic_id: 'clinic-1',
  status: 'active',
  email_verified: true,
  failed_login_attempts: 0,
  must_change_password: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('UserRepository', () => {
  let mockDb: DatabasePool;
  let repo: UserRepository;

  beforeEach(() => {
    mockDb = createMockDb();
    repo = new UserRepository(mockDb);
  });

  describe('findById', () => {
    it('should find user by ID', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [sampleUser],
        rowCount: 1,
      });

      const user = await repo.findById('user-123');

      expect(user).toBeDefined();
      expect(user?.id).toBe('user-123');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND deleted_at IS NULL'),
        ['user-123']
      );
    });

    it('should return null for non-existent user', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const user = await repo.findById('nonexistent');

      expect(user).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should find user by email (case-insensitive)', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [sampleUser],
        rowCount: 1,
      });

      const user = await repo.findByEmail('TEST@EXAMPLE.COM');

      expect(user).toBeDefined();
      expect(user?.email).toBe('test@example.com');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(email) = LOWER($1)'),
        ['TEST@EXAMPLE.COM']
      );
    });

    it('should filter out soft-deleted users', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const user = await repo.findByEmail('deleted@example.com');

      expect(user).toBeNull();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        expect.any(Array)
      );
    });
  });

  describe('create', () => {
    it('should create a new user', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [sampleUser],
        rowCount: 1,
      });

      const user = await repo.create({
        email: 'new@example.com',
        password: 'Password123!',
        name: 'New User',
        role: 'doctor',
      });

      expect(user).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining([expect.stringContaining('new@example.com')])
      );
    });

    it('should lowercase email on creation', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [sampleUser],
        rowCount: 1,
      });

      await repo.create({
        email: 'NEW@EXAMPLE.COM',
        password: 'Password123!',
        name: 'New User',
        role: 'doctor',
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expect.stringContaining('new@example.com')])
      );
    });
  });

  describe('update', () => {
    it('should update user fields', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [{ ...sampleUser, name: 'Updated Name' }],
        rowCount: 1,
      });

      const user = await repo.update('user-123', { name: 'Updated Name' });

      expect(user).toBeDefined();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET'),
        expect.arrayContaining(['Updated Name', 'user-123'])
      );
    });

    it('should set email_verified_at when verifying email', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [{ ...sampleUser, email_verified: true }],
        rowCount: 1,
      });

      await repo.update('user-123', { emailVerified: true });

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('email_verified_at = CURRENT_TIMESTAMP');
    });

    it('should return null when user not found', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const user = await repo.update('nonexistent', { name: 'New Name' });

      expect(user).toBeNull();
    });

    it('should filter soft-deleted users in update', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await repo.update('user-123', { name: 'New Name' });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        expect.any(Array)
      );
    });
  });

  describe('updatePassword', () => {
    it('should update password and reset security fields', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      const result = await repo.updatePassword('user-123', 'NewPassword123!');

      expect(result).toBe(true);
      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('password_changed_at = CURRENT_TIMESTAMP');
      expect(query).toContain('must_change_password = FALSE');
      expect(query).toContain('failed_login_attempts = 0');
      expect(query).toContain('locked_until = NULL');
    });

    it('should return false when user not found', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await repo.updatePassword('nonexistent', 'NewPassword123!');

      expect(result).toBe(false);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      // Use bcrypt to generate actual hash for testing
      const bcrypt = await import('bcryptjs');
      const actualHash = await bcrypt.hash('password123', 12);

      const user: User = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: actualHash,
        name: 'Test',
        role: 'doctor',
        status: 'active',
        emailVerified: true,
        failedLoginAttempts: 0,
        mustChangePassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await repo.verifyPassword(user, 'password123');

      expect(result).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const user: User = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.4M4qx.AaQv6dHe',
        name: 'Test',
        role: 'doctor',
        status: 'active',
        emailVerified: true,
        failedLoginAttempts: 0,
        mustChangePassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await repo.verifyPassword(user, 'wrongpassword');

      expect(result).toBe(false);
    });
  });

  describe('incrementFailedAttempts', () => {
    it('should increment failed attempts', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [{ failed_login_attempts: 1, locked_until: null }],
        rowCount: 1,
      });

      const result = await repo.incrementFailedAttempts('user-123');

      expect(result.attempts).toBe(1);
      expect(result.lockedUntil).toBeUndefined();
    });

    it('should lock account after 5 failed attempts', async () => {
      const lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [{ failed_login_attempts: 5, locked_until: lockedUntil.toISOString() }],
        rowCount: 1,
      });

      const result = await repo.incrementFailedAttempts('user-123');

      expect(result.attempts).toBe(5);
      expect(result.lockedUntil).toBeDefined();
    });
  });

  describe('resetFailedAttempts', () => {
    it('should reset failed attempts and unlock', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      await repo.resetFailedAttempts('user-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts = 0'),
        ['user-123']
      );
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login timestamp and IP', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      await repo.updateLastLogin('user-123', '192.168.1.1');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('last_login_at = CURRENT_TIMESTAMP'),
        ['user-123', '192.168.1.1']
      );
    });
  });

  describe('isAccountLocked', () => {
    it('should return locked status when account is locked', async () => {
      const lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [{ locked_until: lockedUntil.toISOString() }],
        rowCount: 1,
      });

      const result = await repo.isAccountLocked('user-123');

      expect(result.locked).toBe(true);
      expect(result.until).toBeInstanceOf(Date);
    });

    it('should return unlocked when lock has expired', async () => {
      const lockedUntil = new Date(Date.now() - 30 * 60 * 1000); // Past
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [{ locked_until: lockedUntil.toISOString() }],
        rowCount: 1,
      });

      const result = await repo.isAccountLocked('user-123');

      expect(result.locked).toBe(false);
    });

    it('should return unlocked when no lock set', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [{ locked_until: null }],
        rowCount: 1,
      });

      const result = await repo.isAccountLocked('user-123');

      expect(result.locked).toBe(false);
    });
  });

  describe('unlockAccount', () => {
    it('should unlock account', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      await repo.unlockAccount('user-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('locked_until = NULL'),
        ['user-123']
      );
    });
  });

  describe('delete (soft delete)', () => {
    it('should soft delete user', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      const result = await repo.delete('user-123');

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SET deleted_at = CURRENT_TIMESTAMP'),
        ['user-123']
      );
    });

    it('should return false when user not found', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await repo.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('hardDelete', () => {
    it('should permanently delete user', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      const result = await repo.hardDelete('user-123');

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith('DELETE FROM users WHERE id = $1', ['user-123']);
    });
  });

  describe('list', () => {
    it('should list users with pagination', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [sampleUser, { ...sampleUser, id: 'user-456' }] });

      const result = await repo.list({ limit: 2, offset: 0 });

      expect(result.users).toHaveLength(2);
      expect(result.total).toBe(10);
    });

    it('should filter by status', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [sampleUser] });

      await repo.list({ status: 'active' });

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('status = $');
    });

    it('should filter by role', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [sampleUser] });

      await repo.list({ role: 'doctor' });

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('role = $');
    });

    it('should always filter deleted users', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await repo.list();

      const query = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(query).toContain('deleted_at IS NULL');
    });
  });

  describe('search', () => {
    it('should search users by name', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [sampleUser],
        rowCount: 1,
      });

      const users = await repo.search('Test');

      expect(users).toHaveLength(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(name) LIKE'),
        expect.arrayContaining([expect.stringContaining('%test%')])
      );
    });

    it('should search users by email', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [sampleUser],
        rowCount: 1,
      });

      const users = await repo.search('test@');

      expect(users).toHaveLength(1);
    });

    it('should escape LIKE special characters', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await repo.search('test%_user');

      const params = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
      expect(params?.[0]).toContain('\\%');
      expect(params?.[0]).toContain('\\_');
    });
  });

  describe('countByStatus', () => {
    it('should count users by status', async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          { status: 'active', count: '10' },
          { status: 'inactive', count: '5' },
        ],
      });

      const counts = await repo.countByStatus();

      expect(counts.active).toBe(10);
      expect(counts.inactive).toBe(5);
    });
  });

  describe('Static methods', () => {
    it('should generate unique tokens', () => {
      const token1 = UserRepository.generateToken();
      const token2 = UserRepository.generateToken();

      expect(token1).not.toBe(token2);
      expect(token1).toHaveLength(64);
    });

    it('should hash tokens consistently', () => {
      const hash1 = UserRepository.hashToken('test-token');
      const hash2 = UserRepository.hashToken('test-token');

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });

  describe('toSafeUser', () => {
    it('should remove sensitive fields', () => {
      const user: User = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'sensitive',
        name: 'Test',
        role: 'doctor',
        status: 'active',
        emailVerified: true,
        failedLoginAttempts: 3,
        mustChangePassword: false,
        lockedUntil: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const safeUser = toSafeUser(user);

      expect(safeUser).not.toHaveProperty('passwordHash');
      expect(safeUser).not.toHaveProperty('failedLoginAttempts');
      expect(safeUser).not.toHaveProperty('lockedUntil');
      expect(safeUser).not.toHaveProperty('mustChangePassword');
      expect(safeUser).toHaveProperty('id');
      expect(safeUser).toHaveProperty('email');
    });
  });
});
