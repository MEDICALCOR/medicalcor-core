/**
 * @fileoverview Role-Based Access Control Policy
 *
 * Defines roles, permissions, and access policies for the application.
 * Implements HIPAA minimum necessary access principle.
 *
 * @module application/security/RBACPolicy
 */

import { Permission, SecurityPrincipal, SecurityPrincipalType } from './SecurityContext.js';

/**
 * System roles
 */
export enum Role {
  /** Medical doctor - full clinical access */
  DOCTOR = 'DOCTOR',

  /** Surgeon - extended clinical access with treatment capabilities */
  SURGEON = 'SURGEON',

  /** Registered nurse - clinical read and limited update */
  NURSE = 'NURSE',

  /** Front desk staff - case creation and viewing */
  RECEPTIONIST = 'RECEPTIONIST',

  /** System administrator - full access */
  ADMIN = 'ADMIN',

  /** Background system processes */
  SYSTEM = 'SYSTEM',

  /** Compliance/audit reviewer */
  AUDITOR = 'AUDITOR',

  /** Research staff - anonymized data access */
  RESEARCHER = 'RESEARCHER',

  /** External consultant - limited read access */
  CONSULTANT = 'CONSULTANT',

  /** Billing staff - financial data access */
  BILLING = 'BILLING',
}

/**
 * Role to permissions mapping
 *
 * Follows HIPAA minimum necessary principle:
 * Each role gets only the permissions required for their job function.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.DOCTOR]: [
    Permission.OSAX_CASE_CREATE,
    Permission.OSAX_CASE_READ,
    Permission.OSAX_CASE_UPDATE,
    Permission.OSAX_CASE_SCORE,
    Permission.OSAX_CASE_VERIFY,
    Permission.PHI_READ,
    Permission.REPORT_VIEW,
  ],

  [Role.SURGEON]: [
    Permission.OSAX_CASE_CREATE,
    Permission.OSAX_CASE_READ,
    Permission.OSAX_CASE_UPDATE,
    Permission.OSAX_CASE_DELETE,
    Permission.OSAX_CASE_SCORE,
    Permission.OSAX_CASE_VERIFY,
    Permission.PHI_READ,
    Permission.PHI_WRITE,
    Permission.PHI_EXPORT,
    Permission.REPORT_VIEW,
    Permission.REPORT_CREATE,
  ],

  [Role.NURSE]: [
    Permission.OSAX_CASE_READ,
    Permission.OSAX_CASE_UPDATE,
    Permission.PHI_READ,
    Permission.REPORT_VIEW,
  ],

  [Role.RECEPTIONIST]: [
    Permission.OSAX_CASE_CREATE,
    Permission.OSAX_CASE_READ,
  ],

  [Role.ADMIN]: Object.values(Permission),

  [Role.SYSTEM]: Object.values(Permission),

  [Role.AUDITOR]: [
    Permission.ADMIN_AUDIT_VIEW,
    Permission.OSAX_CASE_READ,
    Permission.REPORT_VIEW,
  ],

  [Role.RESEARCHER]: [
    Permission.OSAX_CASE_READ,
    Permission.REPORT_VIEW,
  ],

  [Role.CONSULTANT]: [
    Permission.OSAX_CASE_READ,
  ],

  [Role.BILLING]: [
    Permission.OSAX_CASE_READ,
    Permission.REPORT_VIEW,
    Permission.REPORT_EXPORT,
  ],
};

/**
 * Access policy interface
 */
export interface AccessPolicy {
  /** Policy name */
  name: string;

  /** Policy description */
  description: string;

  /** Policy check function */
  check: (principal: SecurityPrincipal, resource: ResourceContext, action: string) => PolicyResult;
}

/**
 * Resource context for policy evaluation
 */
export interface ResourceContext {
  /** Resource type */
  type: string;

  /** Resource ID */
  id: string;

  /** Organization owning the resource */
  organizationId?: string;

  /** Resource attributes for ABAC */
  attributes?: Record<string, unknown>;
}

/**
 * Policy evaluation result
 */
export interface PolicyResult {
  /** Whether access is allowed */
  allowed: boolean;

  /** Reason for the decision */
  reason?: string;

  /** Policy that made the decision */
  policy: string;
}

/**
 * Data residency policy
 *
 * Users can only access data from their organization.
 * Implements multi-tenancy data isolation.
 */
export const DATA_RESIDENCY_POLICY: AccessPolicy = {
  name: 'data_residency',
  description: 'Users can only access data from their organization',
  check: (principal, resource, _action) => {
    // System principals bypass this check
    if (principal.type === SecurityPrincipalType.SYSTEM) {
      return { allowed: true, policy: 'data_residency' };
    }

    // If resource has no organization, allow
    if (!resource.organizationId) {
      return { allowed: true, policy: 'data_residency' };
    }

    // Check organization match
    if (principal.organizationId === resource.organizationId) {
      return { allowed: true, policy: 'data_residency' };
    }

    return {
      allowed: false,
      reason: 'Access denied: resource belongs to different organization',
      policy: 'data_residency',
    };
  },
};

/**
 * Time-based access policy
 *
 * Sensitive operations only allowed during business hours (8am-6pm).
 * Critical for compliance and security monitoring.
 */
export const TIME_BASED_POLICY: AccessPolicy = {
  name: 'business_hours',
  description: 'Sensitive operations only during business hours (8am-6pm)',
  check: (principal, _resource, action) => {
    // System principals bypass this check
    if (principal.type === SecurityPrincipalType.SYSTEM) {
      return { allowed: true, policy: 'business_hours' };
    }

    // Define sensitive actions that require business hours
    const sensitiveActions = [
      Permission.PHI_EXPORT,
      Permission.PHI_DELETE,
      Permission.OSAX_CASE_DELETE,
      Permission.ADMIN_USER_MANAGE,
      Permission.ADMIN_ROLE_MANAGE,
    ];

    // Check if action is sensitive
    if (!sensitiveActions.includes(action as Permission)) {
      return { allowed: true, policy: 'business_hours' };
    }

    // Check business hours (8am-6pm)
    const hour = new Date().getHours();
    if (hour >= 8 && hour < 18) {
      return { allowed: true, policy: 'business_hours' };
    }

    return {
      allowed: false,
      reason: 'Sensitive operations only allowed during business hours (8am-6pm)',
      policy: 'business_hours',
    };
  },
};

/**
 * MFA requirement policy
 *
 * Sensitive operations require MFA verification.
 */
export const MFA_POLICY: AccessPolicy = {
  name: 'mfa_required',
  description: 'MFA required for sensitive operations',
  check: (principal, _resource, action) => {
    // System principals bypass this check
    if (principal.type === SecurityPrincipalType.SYSTEM) {
      return { allowed: true, policy: 'mfa_required' };
    }

    // Define actions requiring MFA
    const mfaRequiredActions = [
      Permission.PHI_EXPORT,
      Permission.PHI_DELETE,
      Permission.OSAX_CASE_DELETE,
      Permission.ADMIN_USER_MANAGE,
      Permission.ADMIN_ROLE_MANAGE,
      Permission.ADMIN_SYSTEM_CONFIG,
    ];

    // Check if action requires MFA
    if (!mfaRequiredActions.includes(action as Permission)) {
      return { allowed: true, policy: 'mfa_required' };
    }

    // Check MFA status
    if (principal.metadata.mfaVerified) {
      return { allowed: true, policy: 'mfa_required' };
    }

    return {
      allowed: false,
      reason: 'Multi-factor authentication required for this operation',
      policy: 'mfa_required',
    };
  },
};

/**
 * Rate limiting policy
 *
 * Prevents abuse by limiting sensitive operations.
 */
export const RATE_LIMIT_POLICY: AccessPolicy = {
  name: 'rate_limit',
  description: 'Rate limiting for sensitive operations',
  check: (_principal, _resource, _action) => {
    // Rate limiting is typically handled at infrastructure level
    // This is a placeholder for policy-based rate limiting
    return { allowed: true, policy: 'rate_limit' };
  },
};

/**
 * All default policies
 */
export const ALL_POLICIES: AccessPolicy[] = [
  DATA_RESIDENCY_POLICY,
  TIME_BASED_POLICY,
  MFA_POLICY,
  RATE_LIMIT_POLICY,
];

/**
 * Policy Enforcer
 *
 * Evaluates access policies for a given principal, resource, and action.
 */
export class PolicyEnforcer {
  constructor(private readonly policies: AccessPolicy[] = ALL_POLICIES) {}

  /**
   * Check if access is allowed
   *
   * @param principal - The security principal
   * @param resource - The resource being accessed
   * @param action - The action being performed
   * @returns True if all policies allow the access
   */
  enforce(principal: SecurityPrincipal, resource: ResourceContext, action: string): boolean {
    for (const policy of this.policies) {
      const result = policy.check(principal, resource, action);
      if (!result.allowed) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get detailed policy violations
   *
   * @param principal - The security principal
   * @param resource - The resource being accessed
   * @param action - The action being performed
   * @returns Array of violated policy names with reasons
   */
  getViolations(
    principal: SecurityPrincipal,
    resource: ResourceContext,
    action: string
  ): PolicyResult[] {
    const violations: PolicyResult[] = [];

    for (const policy of this.policies) {
      const result = policy.check(principal, resource, action);
      if (!result.allowed) {
        violations.push(result);
      }
    }

    return violations;
  }

  /**
   * Get all policy evaluation results
   *
   * @param principal - The security principal
   * @param resource - The resource being accessed
   * @param action - The action being performed
   * @returns All policy results
   */
  evaluateAll(
    principal: SecurityPrincipal,
    resource: ResourceContext,
    action: string
  ): PolicyResult[] {
    return this.policies.map(policy => policy.check(principal, resource, action));
  }
}

/**
 * Get permissions for a set of roles
 *
 * @param roles - Array of role names
 * @returns Combined permissions for all roles
 */
export function getPermissionsForRoles(roles: string[]): Permission[] {
  const permissions = new Set<Permission>();

  for (const roleName of roles) {
    const role = roleName as Role;
    const rolePermissions = ROLE_PERMISSIONS[role];
    if (rolePermissions) {
      for (const permission of rolePermissions) {
        permissions.add(permission);
      }
    }
  }

  return Array.from(permissions);
}
