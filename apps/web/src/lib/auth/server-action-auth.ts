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
 * For IDOR protection - validates clinic membership for non-admin users
 */
export async function canAccessPatient(patientId: string): Promise<boolean> {
  const session = await auth();

  if (!session?.user) {
    return false;
  }

  // Admins can access all patients
  if (session.user.role === 'admin') {
    return true;
  }

  // Doctors and receptionists must have a clinic assignment
  if (!session.user.clinicId) {
    return false;
  }

  // Verify patient belongs to user's clinic via HubSpot
  try {
    const { HubSpotClient } = await import('@medicalcor/integrations');
    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;

    if (!accessToken) {
      console.error('[canAccessPatient] HUBSPOT_ACCESS_TOKEN not configured');
      return false;
    }

    const hubspot = new HubSpotClient({ accessToken });
    const contact = await hubspot.getContact(patientId);

    // Check if patient's clinic_id matches user's clinic
    // clinic_id is a custom HubSpot property, not in the standard type
    const patientClinicId = (contact.properties as Record<string, string | undefined>).clinic_id;

    // If patient has no clinic assigned, deny access for non-admins
    if (!patientClinicId) {
      return false;
    }

    return patientClinicId === session.user.clinicId;
  } catch (error) {
    console.error('[canAccessPatient] Failed to verify patient access:', error);
    // Fail closed - deny access on error
    return false;
  }
}

/**
 * Require access to a specific patient
 * Throws AuthorizationError if access denied
 */
export async function requirePatientAccess(patientId: string): Promise<void> {
  const hasAccess = await canAccessPatient(patientId);
  if (!hasAccess) {
    throw new AuthorizationError('You do not have access to this patient');
  }
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
