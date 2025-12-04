/**
 * Authentication module exports
 */

import NextAuth from 'next-auth';
import { authConfig, type AuthUser, type UserRole } from './config';

// Create NextAuth instance
const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export { handlers, auth, signIn, signOut };
export type { AuthUser, UserRole };

// Re-export RBAC utilities
export {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getPermissionsForRole,
  canAccessPage,
  isRoleAtLeast,
  getRoleDisplayName,
  PAGE_ACCESS,
  type Permission,
} from './rbac';

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
  'medical_records:read': ['admin', 'doctor'] as UserRole[],
  'medical_records:write': ['admin', 'doctor'] as UserRole[],

  // Appointments
  VIEW_APPOINTMENTS: ['admin', 'doctor', 'receptionist', 'staff'] as UserRole[],
  MANAGE_APPOINTMENTS: ['admin', 'doctor', 'receptionist'] as UserRole[],
  'appointments:read': ['admin', 'doctor', 'receptionist', 'staff'] as UserRole[],
  'appointments:write': ['admin', 'doctor', 'receptionist'] as UserRole[],

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

  // API Keys
  'api_keys:read': ['admin'] as UserRole[],
  'api_keys:write': ['admin'] as UserRole[],
  'api_keys:delete': ['admin'] as UserRole[],

  // Audit
  'audit:read': ['admin'] as UserRole[],
  'audit:write': ['admin'] as UserRole[],
  'audit:export': ['admin'] as UserRole[],

  // Campaigns
  'campaigns:read': ['admin', 'doctor', 'receptionist'] as UserRole[],
  'campaigns:write': ['admin', 'doctor'] as UserRole[],
  'campaigns:delete': ['admin'] as UserRole[],

  // Clinics
  'clinics:read': ['admin'] as UserRole[],
  'clinics:write': ['admin'] as UserRole[],
  'clinics:delete': ['admin'] as UserRole[],

  // Documents
  'documents:read': ['admin', 'doctor', 'receptionist'] as UserRole[],
  'documents:write': ['admin', 'doctor'] as UserRole[],
  'documents:delete': ['admin', 'doctor'] as UserRole[],

  // Inventory
  'inventory:read': ['admin', 'doctor', 'receptionist', 'staff'] as UserRole[],
  'inventory:write': ['admin', 'doctor'] as UserRole[],
  'inventory:delete': ['admin'] as UserRole[],

  // Prescriptions
  'prescriptions:read': ['admin', 'doctor'] as UserRole[],
  'prescriptions:write': ['admin', 'doctor'] as UserRole[],
  'prescriptions:delete': ['admin'] as UserRole[],

  // Reminders
  'reminders:read': ['admin', 'doctor', 'receptionist'] as UserRole[],
  'reminders:write': ['admin', 'doctor', 'receptionist'] as UserRole[],
  'reminders:delete': ['admin', 'doctor'] as UserRole[],

  // Staff Schedule
  'staff:read': ['admin', 'doctor', 'receptionist'] as UserRole[],
  'staff:write': ['admin'] as UserRole[],

  // Users
  'users:read': ['admin'] as UserRole[],
  'users:write': ['admin'] as UserRole[],
  'users:delete': ['admin'] as UserRole[],

  // Billing
  'billing:read': ['admin'] as UserRole[],
  'billing:write': ['admin'] as UserRole[],
  'billing:delete': ['admin'] as UserRole[],

  // Services
  'services:read': ['admin', 'doctor', 'receptionist'] as UserRole[],
  'services:write': ['admin'] as UserRole[],
  'services:delete': ['admin'] as UserRole[],

  // Doctors
  'doctors:read': ['admin', 'doctor', 'receptionist', 'staff'] as UserRole[],

  // WhatsApp Templates
  'whatsapp:read': ['admin', 'doctor', 'receptionist'] as UserRole[],
  'whatsapp:write': ['admin'] as UserRole[],
  'whatsapp:delete': ['admin'] as UserRole[],

  // Waiting List
  'waiting_list:read': ['admin', 'doctor', 'receptionist'] as UserRole[],
  'waiting_list:write': ['admin', 'doctor', 'receptionist'] as UserRole[],
  'waiting_list:delete': ['admin', 'doctor'] as UserRole[],

  // Booking
  'booking:read': ['admin', 'doctor', 'receptionist', 'staff'] as UserRole[],
  'booking:write': ['admin', 'doctor', 'receptionist'] as UserRole[],
} as const;
