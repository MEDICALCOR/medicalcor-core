'use client';

/**
 * RBAC Permission Guard Components
 *
 * Provides React components for conditionally rendering UI based on user permissions.
 *
 * @module components/auth/require-permission
 */

import { useSession } from 'next-auth/react';
import type { ReactNode } from 'react';
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  canAccessPage,
  type Permission,
} from '@/lib/auth/rbac';
import type { UserRole } from '@/lib/auth/config';
import { ShieldAlert, Lock } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface RequirePermissionProps {
  /** Single permission to check */
  permission?: Permission;
  /** Multiple permissions - ALL must be satisfied */
  permissions?: Permission[];
  /** Multiple permissions - ANY must be satisfied */
  anyPermission?: Permission[];
  /** Minimum role required */
  role?: UserRole;
  /** Content to show when permission is granted */
  children: ReactNode;
  /** Content to show when permission is denied (optional) */
  fallback?: ReactNode;
  /** Hide the component entirely when denied (default: show fallback or nothing) */
  hideOnDeny?: boolean;
}

interface RequireRoleProps {
  /** Required role */
  role: UserRole;
  /** Allow higher roles as well */
  orHigher?: boolean;
  /** Content to show when role matches */
  children: ReactNode;
  /** Content to show when role doesn't match */
  fallback?: ReactNode;
}

// =============================================================================
// Components
// =============================================================================

/**
 * Conditionally render content based on user permissions
 *
 * @example
 * ```tsx
 * <RequirePermission permission="billing:create">
 *   <CreateInvoiceButton />
 * </RequirePermission>
 *
 * <RequirePermission
 *   permissions={['patients:edit', 'patients:medical_records']}
 *   fallback={<p>Nu aveți permisiuni pentru această acțiune</p>}
 * >
 *   <EditMedicalRecordForm />
 * </RequirePermission>
 * ```
 */
export function RequirePermission({
  permission,
  permissions,
  anyPermission,
  role: requiredRole,
  children,
  fallback,
  hideOnDeny = false,
}: RequirePermissionProps) {
  const { data: session, status } = useSession();

  // Still loading session
  if (status === 'loading') {
    return null;
  }

  const userRole = session?.user?.role as UserRole | undefined;

  // Check role requirement first
  if (requiredRole && userRole !== requiredRole) {
    return hideOnDeny ? null : (fallback ?? null);
  }

  // Check single permission
  if (permission && !hasPermission(userRole, permission)) {
    return hideOnDeny ? null : (fallback ?? null);
  }

  // Check all permissions
  if (permissions && !hasAllPermissions(userRole, permissions)) {
    return hideOnDeny ? null : (fallback ?? null);
  }

  // Check any permission
  if (anyPermission && !hasAnyPermission(userRole, anyPermission)) {
    return hideOnDeny ? null : (fallback ?? null);
  }

  // Permission granted
  return <>{children}</>;
}

/**
 * Conditionally render content based on user role
 *
 * @example
 * ```tsx
 * <RequireRole role="admin">
 *   <AdminPanel />
 * </RequireRole>
 *
 * <RequireRole role="doctor" orHigher>
 *   <DoctorDashboard />
 * </RequireRole>
 * ```
 */
export function RequireRole({ role, orHigher = false, children, fallback }: RequireRoleProps) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return null;
  }

  const userRole = session?.user?.role as UserRole | undefined;

  if (!userRole) {
    return fallback ?? null;
  }

  const roleHierarchy: Record<UserRole, number> = {
    staff: 1,
    receptionist: 2,
    doctor: 3,
    admin: 4,
  };

  const hasRole = orHigher
    ? roleHierarchy[userRole] >= roleHierarchy[role]
    : userRole === role;

  if (!hasRole) {
    return fallback ?? null;
  }

  return <>{children}</>;
}

/**
 * Access Denied Page Component
 * Shows a friendly message when user doesn't have access
 */
export function AccessDenied({
  message = 'Nu aveți permisiunea de a accesa această pagină',
  showBackButton = true,
}: {
  message?: string;
  showBackButton?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
      <div className="rounded-full bg-destructive/10 p-6 mb-6">
        <ShieldAlert className="h-12 w-12 text-destructive" />
      </div>
      <h2 className="text-2xl font-semibold mb-2">Acces Interzis</h2>
      <p className="text-muted-foreground max-w-md mb-6">{message}</p>
      {showBackButton && (
        <button
          onClick={() => window.history.back()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          Înapoi
        </button>
      )}
    </div>
  );
}

/**
 * Permission Gate for entire pages
 * Use this in layout or page components
 *
 * @example
 * ```tsx
 * export default function SettingsPage() {
 *   return (
 *     <PagePermissionGate pathname="/settings">
 *       <SettingsContent />
 *     </PagePermissionGate>
 *   );
 * }
 * ```
 */
export function PagePermissionGate({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const userRole = session?.user?.role as UserRole | undefined;
  const { allowed, reason } = canAccessPage(userRole, pathname);

  if (!allowed) {
    return <AccessDenied message={reason} />;
  }

  return <>{children}</>;
}

/**
 * Hook to check permissions in components
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { can, canAll, canAny, role, isLoading } = usePermissions();
 *
 *   if (isLoading) return <Spinner />;
 *
 *   return (
 *     <div>
 *       {can('billing:create') && <CreateButton />}
 *       {canAny(['patients:edit', 'patients:delete']) && <ActionMenu />}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePermissions() {
  const { data: session, status } = useSession();

  const userRole = session?.user?.role as UserRole | undefined;

  return {
    /** Check single permission */
    can: (permission: Permission) => hasPermission(userRole, permission),

    /** Check all permissions */
    canAll: (permissions: Permission[]) => hasAllPermissions(userRole, permissions),

    /** Check any permission */
    canAny: (permissions: Permission[]) => hasAnyPermission(userRole, permissions),

    /** Current user role */
    role: userRole,

    /** Session loading state */
    isLoading: status === 'loading',

    /** Is user authenticated */
    isAuthenticated: status === 'authenticated',

    /** Check page access */
    canAccessPage: (pathname: string) => canAccessPage(userRole, pathname),
  };
}

/**
 * Locked Feature Indicator
 * Shows a lock icon with tooltip for features the user can't access
 */
export function LockedFeature({
  permission,
  children,
  tooltip = 'Această funcție necesită permisiuni suplimentare',
}: {
  permission: Permission;
  children: ReactNode;
  tooltip?: string;
}) {
  const { can, isLoading } = usePermissions();

  if (isLoading) {
    return <>{children}</>;
  }

  if (can(permission)) {
    return <>{children}</>;
  }

  return (
    <div className="relative opacity-50 cursor-not-allowed" title={tooltip}>
      <div className="pointer-events-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center bg-background/50">
        <Lock className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}
