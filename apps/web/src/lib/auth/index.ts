/**
 * Authentication module exports
 */

import NextAuth from 'next-auth';
import { authConfig, type AuthUser, type UserRole } from './config';

// Create NextAuth instance
const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export { handlers, auth, signIn, signOut };
export type { AuthUser, UserRole };

/**
 * Get the current session in server components/actions
 */
export async function getSession() {
  return await auth();
}

/**
 * Check if user has required role
 */
export function hasRole(userRole: UserRole | undefined, requiredRoles: UserRole[]): boolean {
  if (!userRole) return false;
  return requiredRoles.includes(userRole);
}

/**
 * Role hierarchy for permission checks
 * admin > doctor > receptionist > staff
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 4,
  doctor: 3,
  receptionist: 2,
  staff: 1,
};

/**
 * Check if user has at least the minimum required role level
 */
export function hasMinimumRole(userRole: UserRole | undefined, minimumRole: UserRole): boolean {
  if (!userRole) return false;
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}

/**
 * Permission definitions for different actions
 */
export const PERMISSIONS = {
  // Patient data
  VIEW_PATIENTS: ['admin', 'doctor', 'receptionist'] as UserRole[],
  EDIT_PATIENTS: ['admin', 'doctor'] as UserRole[],
  DELETE_PATIENTS: ['admin'] as UserRole[],

  // Medical records
  VIEW_MEDICAL_RECORDS: ['admin', 'doctor'] as UserRole[],
  EDIT_MEDICAL_RECORDS: ['doctor'] as UserRole[],

  // Appointments
  VIEW_APPOINTMENTS: ['admin', 'doctor', 'receptionist', 'staff'] as UserRole[],
  MANAGE_APPOINTMENTS: ['admin', 'doctor', 'receptionist'] as UserRole[],

  // Analytics
  VIEW_ANALYTICS: ['admin', 'doctor'] as UserRole[],

  // Settings
  MANAGE_SETTINGS: ['admin'] as UserRole[],
  MANAGE_USERS: ['admin'] as UserRole[],
  MANAGE_INTEGRATIONS: ['admin'] as UserRole[],

  // Workflows
  TRIGGER_WORKFLOWS: ['admin', 'doctor', 'receptionist'] as UserRole[],
  'workflows:read': ['admin', 'doctor', 'receptionist'] as UserRole[],
  'workflows:write': ['admin', 'doctor'] as UserRole[],
  'workflows:delete': ['admin'] as UserRole[],

  // Messages
  VIEW_MESSAGES: ['admin', 'doctor', 'receptionist'] as UserRole[],
  SEND_MESSAGES: ['admin', 'doctor', 'receptionist'] as UserRole[],
} as const;
