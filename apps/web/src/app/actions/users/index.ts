'use server';

import { z } from 'zod';
import { createDatabaseClient, type DatabasePool } from '@medicalcor/core';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';
import { requirePermission, getCurrentUser } from '@/lib/auth/server-action-auth';
import bcrypt from 'bcryptjs';

/**
 * Server Actions for User Management
 *
 * All actions require authentication and appropriate admin permissions.
 */

// Lazy-initialized database connection
let db: DatabasePool | null = null;

function getDatabase(): DatabasePool {
  db ??= createDatabaseClient();
  return db;
}

// =============================================================================
// Types
// =============================================================================

export type UserRole = 'admin' | 'doctor' | 'receptionist' | 'staff';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending_verification';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  clinicId: string | null;
  clinicName: string | null;
  status: UserStatus;
  emailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  byRole: Record<UserRole, number>;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  clinic_id: string | null;
  clinic_name: string | null;
  status: string;
  email_verified: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  role: z.enum(['admin', 'doctor', 'receptionist', 'staff']),
  password: z.string().min(8),
  clinicId: z.string().uuid().optional(),
});

const UpdateUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().optional(),
  name: z.string().min(1).max(200).optional(),
  role: z.enum(['admin', 'doctor', 'receptionist', 'staff']).optional(),
  status: z.enum(['active', 'inactive', 'suspended', 'pending_verification']).optional(),
  clinicId: z.string().uuid().nullable().optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    clinicId: row.clinic_id,
    clinicName: row.clinic_name,
    status: row.status as UserStatus,
    emailVerified: row.email_verified,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Get all users (optionally filtered by clinic)
 */
export async function getUsersAction(clinicId?: string): Promise<User[]> {
  await requirePermission('users:read');
  const user = await requireCurrentUser();
  const user = await getCurrentUser();

  const database = getDatabase();

  // Non-admin users can only see users from their clinic
  const filterClinicId = user?.role === 'admin' ? clinicId : user?.clinicId;

  let query = `
    SELECT
      u.id, u.email, u.name, u.role, u.clinic_id,
      c.name as clinic_name,
      u.status, u.email_verified, u.last_login_at,
      u.created_at, u.updated_at
    FROM users u
    LEFT JOIN clinics c ON u.clinic_id = c.id
    WHERE u.deleted_at IS NULL
  `;
  const params: unknown[] = [];

  if (filterClinicId) {
    params.push(filterClinicId);
    query += ` AND u.clinic_id = $${params.length}`;
  }

  query += ' ORDER BY u.created_at DESC';

  const result = await database.query<UserRow>(query, params);

  return result.rows.map(rowToUser);
}

/**
 * Get user by ID
 */
export async function getUserByIdAction(id: string): Promise<User | null> {
  await requirePermission('users:read');

  const database = getDatabase();

  const result = await database.query<UserRow>(
    `SELECT
      u.id, u.email, u.name, u.role, u.clinic_id,
      c.name as clinic_name,
      u.status, u.email_verified, u.last_login_at,
      u.created_at, u.updated_at
    FROM users u
    LEFT JOIN clinics c ON u.clinic_id = c.id
    WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToUser(result.rows[0]);
}

/**
 * Get user statistics
 */
export async function getUserStatsAction(): Promise<UserStats> {
  await requirePermission('users:read');
  const user = await requireCurrentUser();
  const user = await getCurrentUser();

  const database = getDatabase();

  let query = `
    SELECT
      COUNT(*) as total_users,
      COUNT(*) FILTER (WHERE status = 'active') as active_users,
      COUNT(*) FILTER (WHERE role = 'admin') as admin_count,
      COUNT(*) FILTER (WHERE role = 'doctor') as doctor_count,
      COUNT(*) FILTER (WHERE role = 'receptionist') as receptionist_count,
      COUNT(*) FILTER (WHERE role = 'staff') as staff_count
    FROM users
    WHERE deleted_at IS NULL
  `;
  const params: unknown[] = [];

  // Non-admin users see stats for their clinic only
  if (user?.role !== 'admin' && user?.clinicId) {
    params.push(user.clinicId);
    query += ` AND clinic_id = $${params.length}`;
  }

  const result = await database.query<{
    total_users: string;
    active_users: string;
    admin_count: string;
    doctor_count: string;
    receptionist_count: string;
    staff_count: string;
  }>(query, params);

  const stats = result.rows[0];
  return {
    totalUsers: parseInt(stats.total_users, 10),
    activeUsers: parseInt(stats.active_users, 10),
    byRole: {
      admin: parseInt(stats.admin_count, 10),
      doctor: parseInt(stats.doctor_count, 10),
      receptionist: parseInt(stats.receptionist_count, 10),
      staff: parseInt(stats.staff_count, 10),
    },
  };
}

/**
 * Create a new user
 */
export async function createUserAction(data: z.infer<typeof CreateUserSchema>): Promise<User> {
  await requirePermission('users:write');
  const currentUser = await requireCurrentUser();
  const currentUser = await getCurrentUser();

  const parsed = CreateUserSchema.parse(data);
  const database = getDatabase();

  // Non-admin users can only create users in their clinic
  const clinicId = currentUser?.role === 'admin' ? parsed.clinicId : currentUser?.clinicId;

  // Hash password
  const passwordHash = await bcrypt.hash(parsed.password, 12);

  const result = await database.query<UserRow>(
    `INSERT INTO users (email, name, role, password_hash, clinic_id, status)
     VALUES ($1, $2, $3, $4, $5, 'pending_verification')
     RETURNING
       id, email, name, role, clinic_id,
       NULL as clinic_name,
       status, email_verified, last_login_at,
       created_at, updated_at`,
    [parsed.email, parsed.name, parsed.role, passwordHash, clinicId ?? null]
  );

  return rowToUser(result.rows[0]);
}

/**
 * Update a user
 */
export async function updateUserAction(data: z.infer<typeof UpdateUserSchema>): Promise<User> {
  await requirePermission('users:write');

  const parsed = UpdateUserSchema.parse(data);
  const database = getDatabase();

  const updates: string[] = [];
  const values: unknown[] = [];

  if (parsed.email !== undefined) {
    values.push(parsed.email);
    updates.push(`email = $${values.length}`);
  }
  if (parsed.name !== undefined) {
    values.push(parsed.name);
    updates.push(`name = $${values.length}`);
  }
  if (parsed.role !== undefined) {
    values.push(parsed.role);
    updates.push(`role = $${values.length}`);
  }
  if (parsed.status !== undefined) {
    values.push(parsed.status);
    updates.push(`status = $${values.length}`);
  }
  if (parsed.clinicId !== undefined) {
    values.push(parsed.clinicId);
    updates.push(`clinic_id = $${values.length}`);
  }

  if (updates.length === 0) {
    throw new Error('No updates provided');
  }

  values.push(parsed.id);

  const result = await database.query<UserRow>(
    `UPDATE users
     SET ${updates.join(', ')}
     WHERE id = $${values.length} AND deleted_at IS NULL
     RETURNING
       id, email, name, role, clinic_id,
       NULL as clinic_name,
       status, email_verified, last_login_at,
       created_at, updated_at`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  return rowToUser(result.rows[0]);
}

/**
 * Delete a user (soft delete)
 */
export async function deleteUserAction(id: string): Promise<boolean> {
  await requirePermission('users:delete');

  const database = getDatabase();

  const result = await database.query(
    `UPDATE users
     SET deleted_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [id]
  );

  return result.rows.length > 0;
}

/**
 * Reset user password (admin action)
 */
export async function resetUserPasswordAction(
  userId: string,
  newPassword: string
): Promise<boolean> {
  await requirePermission('users:write');

  const database = getDatabase();

  const passwordHash = await bcrypt.hash(newPassword, 12);

  const result = await database.query(
    `UPDATE users
     SET password_hash = $1, must_change_password = true, password_changed_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [passwordHash, userId]
  );

  return result.rows.length > 0;
}

/**
 * Unlock a locked user account
 */
export async function unlockUserAction(userId: string): Promise<boolean> {
  await requirePermission('users:write');

  const database = getDatabase();

  const result = await database.query(
    `UPDATE users
     SET locked_until = NULL, failed_login_attempts = 0
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [userId]
  );

  return result.rows.length > 0;
}
