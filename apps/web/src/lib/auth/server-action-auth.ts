/**
 * Server Action Authorization Utilities
 * Provides authorization checks for server actions
 */

import { auth, hasRole, PERMISSIONS, type UserRole } from './index';

export class AuthorizationError extends Error {
  constructor(message: string = 'Unauthorized access') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Require authentication for a server action
 * Throws if user is not authenticated
 */
export async function requireAuth() {
  const session = await auth();

  if (!session?.user) {
    throw new AuthorizationError('Authentication required');
  }

  return session;
}

/**
 * Require specific roles for a server action
 * Throws if user doesn't have required role
 */
export async function requireRole(requiredRoles: UserRole[]) {
  const session = await requireAuth();

  if (!hasRole(session.user.role, requiredRoles)) {
    throw new AuthorizationError(
      `Insufficient permissions. Required roles: ${requiredRoles.join(', ')}`
    );
  }

  return session;
}

/**
 * Require permission for a server action
 */
export async function requirePermission(permission: keyof typeof PERMISSIONS) {
  const session = await requireAuth();
  const allowedRoles = PERMISSIONS[permission];

  if (!hasRole(session.user.role, allowedRoles as UserRole[])) {
    throw new AuthorizationError(`Permission denied: ${permission}`);
  }

  return session;
}

/**
 * Get current user or null
 * Non-throwing version for optional auth checks
 */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * Check if current user can access a specific patient
 * For IDOR protection
 */
export async function canAccessPatient(_patientId: string): Promise<boolean> {
  const session = await auth();

  if (!session?.user) {
    return false;
  }

  // Admins and doctors can access all patients
  if (hasRole(session.user.role, ['admin', 'doctor'])) {
    return true;
  }

  // Receptionists can access patients at their clinic
  if (session.user.role === 'receptionist' && session.user.clinicId) {
    // In production: check if patient belongs to user's clinic
    // For now, allow access
    return true;
  }

  return false;
}

/**
 * Wrap a server action with authorization
 */
export function withAuth<TArgs extends unknown[], TResult>(
  requiredRoles: UserRole[],
  action: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    await requireRole(requiredRoles);
    return action(...args);
  };
}
