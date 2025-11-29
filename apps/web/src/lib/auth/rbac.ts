/**
 * Role-Based Access Control (RBAC) Utilities
 *
 * Provides granular permission checks for UI pages and features.
 * Integrates with NextAuth session to check user roles.
 *
 * @module lib/auth/rbac
 */

import type { UserRole } from './config';

// =============================================================================
// Permission Definitions
// =============================================================================

/**
 * Available permissions in the system
 */
export type Permission =
  // Dashboard & Analytics
  | 'dashboard:view'
  | 'analytics:view'
  | 'analytics:export'
  // Leads & Patients
  | 'leads:view'
  | 'leads:create'
  | 'leads:edit'
  | 'leads:delete'
  | 'patients:view'
  | 'patients:create'
  | 'patients:edit'
  | 'patients:delete'
  | 'patients:medical_records'
  // Appointments
  | 'appointments:view'
  | 'appointments:create'
  | 'appointments:edit'
  | 'appointments:cancel'
  // Messaging
  | 'messages:view'
  | 'messages:send'
  | 'messages:templates'
  // Triage
  | 'triage:view'
  | 'triage:score'
  | 'triage:escalate'
  // Billing
  | 'billing:view'
  | 'billing:create'
  | 'billing:refund'
  // Settings & Admin
  | 'settings:view'
  | 'settings:edit'
  | 'users:view'
  | 'users:create'
  | 'users:edit'
  | 'users:delete'
  | 'clinics:manage'
  | 'integrations:manage'
  | 'audit:view'
  // AI Features
  | 'ai:copilot'
  | 'ai:scoring'
  | 'ai:replies';

/**
 * Role-Permission mapping
 * Defines what each role can do
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    // Admins have all permissions
    'dashboard:view',
    'analytics:view',
    'analytics:export',
    'leads:view',
    'leads:create',
    'leads:edit',
    'leads:delete',
    'patients:view',
    'patients:create',
    'patients:edit',
    'patients:delete',
    'patients:medical_records',
    'appointments:view',
    'appointments:create',
    'appointments:edit',
    'appointments:cancel',
    'messages:view',
    'messages:send',
    'messages:templates',
    'triage:view',
    'triage:score',
    'triage:escalate',
    'billing:view',
    'billing:create',
    'billing:refund',
    'settings:view',
    'settings:edit',
    'users:view',
    'users:create',
    'users:edit',
    'users:delete',
    'clinics:manage',
    'integrations:manage',
    'audit:view',
    'ai:copilot',
    'ai:scoring',
    'ai:replies',
  ],

  doctor: [
    'dashboard:view',
    'analytics:view',
    'leads:view',
    'patients:view',
    'patients:create',
    'patients:edit',
    'patients:medical_records',
    'appointments:view',
    'appointments:create',
    'appointments:edit',
    'appointments:cancel',
    'messages:view',
    'messages:send',
    'triage:view',
    'triage:score',
    'triage:escalate',
    'billing:view',
    'settings:view',
    'ai:copilot',
    'ai:scoring',
    'ai:replies',
  ],

  receptionist: [
    'dashboard:view',
    'leads:view',
    'leads:create',
    'leads:edit',
    'patients:view',
    'patients:create',
    'patients:edit',
    'appointments:view',
    'appointments:create',
    'appointments:edit',
    'appointments:cancel',
    'messages:view',
    'messages:send',
    'triage:view',
    'triage:score',
    'billing:view',
    'billing:create',
    'ai:copilot',
    'ai:replies',
  ],

  staff: [
    'dashboard:view',
    'leads:view',
    'patients:view',
    'appointments:view',
    'messages:view',
    'triage:view',
  ],
};

// =============================================================================
// Permission Checking Functions
// =============================================================================

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Check if a role has ALL of the specified permissions
 */
export function hasAllPermissions(
  role: UserRole | undefined,
  permissions: Permission[]
): boolean {
  if (!role) return false;
  return permissions.every((p) => hasPermission(role, p));
}

/**
 * Check if a role has ANY of the specified permissions
 */
export function hasAnyPermission(
  role: UserRole | undefined,
  permissions: Permission[]
): boolean {
  if (!role) return false;
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * Get all permissions for a role
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

// =============================================================================
// Page Access Control
// =============================================================================

/**
 * Page access requirements
 */
interface PageAccess {
  /** Minimum role required (any of these roles) */
  roles?: UserRole[];
  /** Required permissions (all must be satisfied) */
  permissions?: Permission[];
  /** Allow if user has any of these permissions */
  anyPermission?: Permission[];
}

/**
 * Page access configuration
 * Maps routes to their access requirements
 */
export const PAGE_ACCESS: Record<string, PageAccess> = {
  // Dashboard - everyone can view
  '/': { permissions: ['dashboard:view'] },

  // Analytics - admin and doctor only
  '/analytics': { permissions: ['analytics:view'] },

  // Leads & Triage
  '/triage': { permissions: ['triage:view'] },
  '/leads': { permissions: ['leads:view'] },

  // Patients
  '/patients': { permissions: ['patients:view'] },
  '/patient/[id]': { permissions: ['patients:view'] },
  '/medical-records': { permissions: ['patients:medical_records'] },

  // Appointments
  '/calendar': { permissions: ['appointments:view'] },
  '/booking': { permissions: ['appointments:create'] },
  '/waiting-list': { permissions: ['appointments:view'] },

  // Messaging
  '/messages': { permissions: ['messages:view'] },
  '/campaigns': { permissions: ['messages:templates'] },
  '/reminders': { permissions: ['messages:send'] },

  // Billing
  '/billing': { permissions: ['billing:view'] },

  // Settings (admin only)
  '/settings': { permissions: ['settings:view'] },
  '/settings/integrations': { permissions: ['integrations:manage'] },
  '/settings/templates': { permissions: ['messages:templates'] },
  '/users': { permissions: ['users:view'] },
  '/clinics': { permissions: ['clinics:manage'] },
  '/audit': { permissions: ['audit:view'] },
  '/api-keys': { roles: ['admin'] },

  // Reports
  '/reports': { permissions: ['analytics:view'] },

  // Workflows
  '/workflows': { roles: ['admin', 'doctor'] },

  // Documents
  '/documents': { permissions: ['patients:view'] },
  '/prescriptions': { permissions: ['patients:medical_records'] },
  '/lab-results': { permissions: ['patients:medical_records'] },

  // Inventory (admin only)
  '/inventory': { roles: ['admin'] },

  // Staff Schedule
  '/staff-schedule': { roles: ['admin', 'doctor'] },

  // Import
  '/import': { roles: ['admin'] },
};

/**
 * Check if a user can access a specific page
 */
export function canAccessPage(
  role: UserRole | undefined,
  pathname: string
): { allowed: boolean; reason?: string } {
  // Find matching page config
  let pageConfig = PAGE_ACCESS[pathname];

  // Try to match dynamic routes
  if (!pageConfig) {
    for (const [pattern, config] of Object.entries(PAGE_ACCESS)) {
      if (pattern.includes('[') && matchDynamicRoute(pathname, pattern)) {
        pageConfig = config;
        break;
      }
    }
  }

  // If no config found, allow by default (public pages)
  if (!pageConfig) {
    return { allowed: true };
  }

  if (!role) {
    return { allowed: false, reason: 'Authentication required' };
  }

  // Check role requirement
  if (pageConfig.roles && !pageConfig.roles.includes(role)) {
    return { allowed: false, reason: `Requires role: ${pageConfig.roles.join(' or ')}` };
  }

  // Check permissions (all required)
  if (pageConfig.permissions && !hasAllPermissions(role, pageConfig.permissions)) {
    return { allowed: false, reason: `Missing permissions: ${pageConfig.permissions.join(', ')}` };
  }

  // Check any permission
  if (pageConfig.anyPermission && !hasAnyPermission(role, pageConfig.anyPermission)) {
    return {
      allowed: false,
      reason: `Requires one of: ${pageConfig.anyPermission.join(', ')}`,
    };
  }

  return { allowed: true };
}

/**
 * Match a pathname against a dynamic route pattern
 */
function matchDynamicRoute(pathname: string, pattern: string): boolean {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');

  if (patternParts.length !== pathParts.length) {
    return false;
  }

  return patternParts.every((part, i) => {
    if (part.startsWith('[') && part.endsWith(']')) {
      return true; // Dynamic segment matches anything
    }
    return part === pathParts[i];
  });
}

// =============================================================================
// Role Hierarchy
// =============================================================================

/**
 * Role hierarchy for comparison
 * Higher number = more permissions
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  staff: 1,
  receptionist: 2,
  doctor: 3,
  admin: 4,
};

/**
 * Check if a role is at least as privileged as another
 */
export function isRoleAtLeast(role: UserRole | undefined, minimumRole: UserRole): boolean {
  if (!role) return false;
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimumRole];
}

/**
 * Get the display name for a role
 */
export function getRoleDisplayName(role: UserRole): string {
  const names: Record<UserRole, string> = {
    admin: 'Administrator',
    doctor: 'Doctor',
    receptionist: 'Recepționer',
    staff: 'Personal',
  };
  return names[role];
}
