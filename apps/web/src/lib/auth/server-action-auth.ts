/**
 * Server Action Authorization Utilities
 * Provides authorization checks for server actions
 */

import { auth, hasRole, PERMISSIONS, type UserRole } from './index';

export class AuthorizationError extends Error {
  constructor(message = 'Unauthorized access') {
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

  if (!hasRole(session.user.role, allowedRoles)) {
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
 * For IDOR protection - validates patient belongs to user's clinic
 */
export async function canAccessPatient(patientId: string): Promise<boolean> {
  const session = await auth();

  if (!session?.user) {
    return false;
  }

  if (!patientId) {
    return false;
  }

  // Admins can access all patients across all clinics
  if (session.user.role === 'admin') {
    return true;
  }

  // For doctors and receptionists, must verify patient belongs to their clinic
  if (!session.user.clinicId) {
    // User has no clinic assigned - deny access
    return false;
  }

  // CRITICAL: Verify patient belongs to user's clinic
  // This function MUST be implemented with actual database lookup
  const patientClinicId = await getPatientClinicId(patientId);

  if (!patientClinicId) {
    // Patient not found
    return false;
  }

  return patientClinicId === session.user.clinicId;
}

/**
 * Get the clinic ID for a patient
 * CRITICAL: This must query the actual database in production
 */
// eslint-disable-next-line @typescript-eslint/require-await
async function getPatientClinicId(patientId: string): Promise<string | null> {
  // TODO: Replace with actual database query
  // Example: return await db.patient.findUnique({ where: { id: patientId } })?.clinicId
  //
  // For now, we DENY access until database integration is complete
  // This is safer than allowing access without verification
  console.warn(
    `[SECURITY] getPatientClinicId called for ${patientId} but database integration not complete. Denying access.`
  );
  return null;
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
