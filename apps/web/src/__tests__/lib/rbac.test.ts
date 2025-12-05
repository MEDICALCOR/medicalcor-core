import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getPermissionsForRole,
  canAccessPage,
  isRoleAtLeast,
  getRoleDisplayName,
  type Permission,
} from '../../lib/auth/rbac';
import type { UserRole } from '../../lib/auth/config';

describe('RBAC', () => {
  describe('hasPermission', () => {
    it('should return true for admin with any permission', () => {
      expect(hasPermission('admin', 'dashboard:view')).toBe(true);
      expect(hasPermission('admin', 'users:delete')).toBe(true);
      expect(hasPermission('admin', 'clinics:manage')).toBe(true);
    });

    it('should return true for doctor with allowed permissions', () => {
      expect(hasPermission('doctor', 'dashboard:view')).toBe(true);
      expect(hasPermission('doctor', 'patients:view')).toBe(true);
      expect(hasPermission('doctor', 'patients:medical_records')).toBe(true);
    });

    it('should return false for doctor with admin-only permissions', () => {
      expect(hasPermission('doctor', 'users:delete')).toBe(false);
      expect(hasPermission('doctor', 'clinics:manage')).toBe(false);
      expect(hasPermission('doctor', 'integrations:manage')).toBe(false);
    });

    it('should return true for receptionist with allowed permissions', () => {
      expect(hasPermission('receptionist', 'dashboard:view')).toBe(true);
      expect(hasPermission('receptionist', 'appointments:create')).toBe(true);
      expect(hasPermission('receptionist', 'billing:view')).toBe(true);
    });

    it('should return false for receptionist with restricted permissions', () => {
      expect(hasPermission('receptionist', 'patients:medical_records')).toBe(false);
      expect(hasPermission('receptionist', 'users:delete')).toBe(false);
      expect(hasPermission('receptionist', 'workflows:delete')).toBe(false);
    });

    it('should return true for staff with view permissions', () => {
      expect(hasPermission('staff', 'dashboard:view')).toBe(true);
      expect(hasPermission('staff', 'patients:view')).toBe(true);
      expect(hasPermission('staff', 'messages:view')).toBe(true);
    });

    it('should return false for staff with edit/delete permissions', () => {
      expect(hasPermission('staff', 'patients:create')).toBe(false);
      expect(hasPermission('staff', 'appointments:create')).toBe(false);
      expect(hasPermission('staff', 'messages:send')).toBe(false);
    });

    it('should return false for undefined role', () => {
      expect(hasPermission(undefined, 'dashboard:view')).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true when role has all specified permissions', () => {
      expect(
        hasAllPermissions('admin', ['dashboard:view', 'users:delete', 'clinics:manage'])
      ).toBe(true);
    });

    it('should return false when role is missing one permission', () => {
      expect(
        hasAllPermissions('doctor', ['dashboard:view', 'patients:view', 'users:delete'])
      ).toBe(false);
    });

    it('should return true for empty permissions array', () => {
      expect(hasAllPermissions('staff', [])).toBe(true);
    });

    it('should return false for undefined role', () => {
      expect(hasAllPermissions(undefined, ['dashboard:view'])).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true when role has at least one permission', () => {
      expect(
        hasAnyPermission('receptionist', ['users:delete', 'appointments:create', 'clinics:manage'])
      ).toBe(true);
    });

    it('should return false when role has none of the permissions', () => {
      expect(
        hasAnyPermission('staff', ['patients:create', 'users:delete', 'clinics:manage'])
      ).toBe(false);
    });

    it('should return true when role has all permissions', () => {
      expect(hasAnyPermission('admin', ['dashboard:view', 'users:delete'])).toBe(true);
    });

    it('should return false for empty permissions array', () => {
      expect(hasAnyPermission('admin', [])).toBe(false);
    });

    it('should return false for undefined role', () => {
      expect(hasAnyPermission(undefined, ['dashboard:view'])).toBe(false);
    });
  });

  describe('getPermissionsForRole', () => {
    it('should return all permissions for admin', () => {
      const permissions = getPermissionsForRole('admin');
      expect(permissions).toContain('dashboard:view');
      expect(permissions).toContain('users:delete');
      expect(permissions).toContain('clinics:manage');
      expect(permissions.length).toBeGreaterThan(30);
    });

    it('should return appropriate permissions for doctor', () => {
      const permissions = getPermissionsForRole('doctor');
      expect(permissions).toContain('patients:medical_records');
      expect(permissions).toContain('triage:escalate');
      expect(permissions).not.toContain('users:delete');
      expect(permissions).not.toContain('clinics:manage');
    });

    it('should return limited permissions for staff', () => {
      const permissions = getPermissionsForRole('staff');
      expect(permissions).toContain('dashboard:view');
      expect(permissions).toContain('patients:view');
      expect(permissions).not.toContain('patients:create');
      expect(permissions.length).toBeLessThan(10);
    });
  });

  describe('canAccessPage', () => {
    it('should allow admin to access admin-only pages', () => {
      expect(canAccessPage('admin', '/users').allowed).toBe(true);
      expect(canAccessPage('admin', '/clinics').allowed).toBe(true);
      expect(canAccessPage('admin', '/api-keys').allowed).toBe(true);
    });

    it('should deny non-admin access to admin-only pages', () => {
      expect(canAccessPage('doctor', '/api-keys').allowed).toBe(false);
      expect(canAccessPage('receptionist', '/clinics').allowed).toBe(false);
      expect(canAccessPage('staff', '/users').allowed).toBe(false);
    });

    it('should allow all authenticated users to access dashboard', () => {
      expect(canAccessPage('admin', '/').allowed).toBe(true);
      expect(canAccessPage('doctor', '/').allowed).toBe(true);
      expect(canAccessPage('receptionist', '/').allowed).toBe(true);
      expect(canAccessPage('staff', '/').allowed).toBe(true);
    });

    it('should allow doctor to access medical records', () => {
      expect(canAccessPage('doctor', '/medical-records').allowed).toBe(true);
    });

    it('should deny receptionist access to medical records', () => {
      expect(canAccessPage('receptionist', '/medical-records').allowed).toBe(false);
    });

    it('should allow public pages without role', () => {
      expect(canAccessPage(undefined, '/unknown-page').allowed).toBe(true);
    });

    it('should deny unauthenticated users access to protected pages', () => {
      const result = canAccessPage(undefined, '/patients');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Authentication required');
    });

    it('should provide reason for denied access', () => {
      const result = canAccessPage('staff', '/api-keys');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('role');
    });

    it('should match dynamic routes', () => {
      expect(canAccessPage('doctor', '/patient/123').allowed).toBe(true);
      expect(canAccessPage('staff', '/patient/123').allowed).toBe(true);
    });

    it('should handle permissions-based access', () => {
      expect(canAccessPage('receptionist', '/billing').allowed).toBe(true);
      expect(canAccessPage('staff', '/billing').allowed).toBe(false);
    });
  });

  describe('isRoleAtLeast', () => {
    it('should return true when role is exactly the minimum', () => {
      expect(isRoleAtLeast('doctor', 'doctor')).toBe(true);
      expect(isRoleAtLeast('admin', 'admin')).toBe(true);
    });

    it('should return true when role is higher than minimum', () => {
      expect(isRoleAtLeast('admin', 'doctor')).toBe(true);
      expect(isRoleAtLeast('admin', 'receptionist')).toBe(true);
      expect(isRoleAtLeast('admin', 'staff')).toBe(true);
      expect(isRoleAtLeast('doctor', 'receptionist')).toBe(true);
      expect(isRoleAtLeast('doctor', 'staff')).toBe(true);
    });

    it('should return false when role is lower than minimum', () => {
      expect(isRoleAtLeast('staff', 'receptionist')).toBe(false);
      expect(isRoleAtLeast('staff', 'doctor')).toBe(false);
      expect(isRoleAtLeast('receptionist', 'admin')).toBe(false);
    });

    it('should return false for undefined role', () => {
      expect(isRoleAtLeast(undefined, 'staff')).toBe(false);
    });
  });

  describe('getRoleDisplayName', () => {
    it('should return correct display names for each role', () => {
      expect(getRoleDisplayName('admin')).toBe('Administrator');
      expect(getRoleDisplayName('doctor')).toBe('Doctor');
      expect(getRoleDisplayName('receptionist')).toBe('Recepționer');
      expect(getRoleDisplayName('staff')).toBe('Personal');
    });
  });
});
