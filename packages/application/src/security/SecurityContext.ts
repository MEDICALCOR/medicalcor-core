/**
 * @fileoverview Security Context for Request Processing
 *
 * Provides authentication, authorization, and audit context
 * for all application operations. HIPAA/GDPR compliant.
 *
 * @module application/security/SecurityContext
 *
 * SECURITY PRINCIPLES:
 * 1. Zero Trust - Every request is verified
 * 2. Least Privilege - Minimal permissions granted
 * 3. Audit Trail - All actions logged
 * 4. Defense in Depth - Multiple security layers
 */

import { randomUUID } from 'node:crypto';
import { DomainError, ErrorSeverity } from '../shared/DomainError.js';
import type { AuditEntry, AuditAction } from '../ports/secondary/external/AuditService.js';

/**
 * Types of security principals
 */
export enum SecurityPrincipalType {
  /** Human user */
  USER = 'USER',
  /** Service account */
  SERVICE = 'SERVICE',
  /** System process */
  SYSTEM = 'SYSTEM',
}

/**
 * Available permissions in the system
 *
 * Format: domain:resource:action
 */
export enum Permission {
  // Clinical Case permissions
  CASE_CREATE = 'case:create',
  CASE_READ = 'case:read',
  CASE_UPDATE = 'case:update',
  CASE_DELETE = 'case:delete',
  CASE_SCORE = 'case:score',
  CASE_VERIFY = 'case:verify',
  CASE_EXPORT = 'case:export',

  // PHI permissions (Protected Health Information)
  PHI_READ = 'phi:read',
  PHI_WRITE = 'phi:write',
  PHI_EXPORT = 'phi:export',
  PHI_DELETE = 'phi:delete',

  // Admin permissions
  ADMIN_USER_MANAGE = 'admin:user:manage',
  ADMIN_ROLE_MANAGE = 'admin:role:manage',
  ADMIN_AUDIT_VIEW = 'admin:audit:view',
  ADMIN_SYSTEM_CONFIG = 'admin:system:config',

  // Reporting permissions
  REPORT_VIEW = 'report:view',
  REPORT_CREATE = 'report:create',
  REPORT_EXPORT = 'report:export',
}

/**
 * Security Principal
 *
 * Represents the authenticated entity performing actions.
 */
export interface SecurityPrincipal {
  /** Unique principal identifier */
  id: string;

  /** Type of principal */
  type: SecurityPrincipalType;

  /** Assigned roles */
  roles: string[];

  /** Effective permissions (derived from roles + direct grants) */
  permissions: Permission[];

  /** Organization ID for multi-tenancy */
  organizationId?: string;

  /** Department within organization */
  department?: string;

  /** Display name */
  displayName?: string;

  /** Email address */
  email?: string;

  /** Request metadata */
  metadata: SecurityMetadata;
}

/**
 * Security metadata from the request
 */
export interface SecurityMetadata {
  /** Client IP address */
  ipAddress?: string;

  /** User agent string */
  userAgent?: string;

  /** Whether MFA was verified */
  mfaVerified: boolean;

  /** Session ID */
  sessionId?: string;

  /** Authentication method used */
  authMethod?: 'password' | 'oauth' | 'saml' | 'api_key' | 'service_token';

  /** Token expiration time */
  tokenExpiry?: Date;

  /** Geographic location */
  geoLocation?: {
    country?: string;
    region?: string;
    city?: string;
  };

  /** Device fingerprint */
  deviceId?: string;
}

/**
 * Security Context
 *
 * Encapsulates all security-related information for a request.
 * Provides permission checking, audit logging, and context propagation.
 *
 * @example
 * ```typescript
 * // Create context from authenticated request
 * const context = SecurityContext.create(principal, correlationId);
 *
 * // Check permission before action
 * context.requirePermission(Permission.CASE_CREATE);
 *
 * // Create audit entry
 * const auditEntry = context.createAuditEntry(
 *   'CREATE_CASE',
 *   'Case',
 *   caseId,
 *   'SUCCESS'
 * );
 * ```
 */
export class SecurityContext {
  private constructor(
    /** The authenticated principal */
    public readonly principal: SecurityPrincipal,
    /** Correlation ID for distributed tracing */
    public readonly correlationId: string,
    /** Context creation timestamp */
    public readonly timestamp: Date,
    /** Request ID (unique per request) */
    public readonly requestId: string
  ) {}

  /**
   * Create a new security context
   *
   * @param principal - The authenticated principal
   * @param correlationId - Correlation ID for tracing
   * @returns New SecurityContext instance
   */
  static create(principal: SecurityPrincipal, correlationId: string): SecurityContext {
    return new SecurityContext(principal, correlationId, new Date(), randomUUID());
  }

  /**
   * Create a system context for background jobs
   *
   * @param correlationId - Correlation ID for tracing
   * @param systemId - System identifier
   * @returns SecurityContext with system permissions
   */
  static createSystemContext(correlationId: string, systemId: string = 'SYSTEM'): SecurityContext {
    const systemPrincipal: SecurityPrincipal = {
      id: systemId,
      type: SecurityPrincipalType.SYSTEM,
      roles: ['SYSTEM'],
      permissions: Object.values(Permission),
      metadata: {
        mfaVerified: true,
        authMethod: 'service_token',
      },
    };
    return SecurityContext.create(systemPrincipal, correlationId);
  }

  /**
   * Require a specific permission, throwing if not present
   *
   * @param permission - The required permission
   * @throws DomainError if permission is denied
   */
  requirePermission(permission: Permission): void {
    if (!this.hasPermission(permission)) {
      throw new DomainError(
        'security.permission_denied',
        `Permission denied: ${permission}`,
        {
          principalId: this.principal.id,
          principalType: this.principal.type,
          requiredPermission: permission,
          availablePermissions: this.principal.permissions,
        },
        ErrorSeverity.HIGH,
        this.correlationId
      );
    }
  }

  /**
   * Check if principal has a specific permission
   *
   * @param permission - The permission to check
   * @returns True if principal has the permission
   */
  hasPermission(permission: Permission): boolean {
    return this.principal.permissions.includes(permission);
  }

  /**
   * Check if principal has any of the specified permissions
   *
   * @param permissions - Permissions to check
   * @returns True if principal has at least one
   */
  hasAnyPermission(permissions: Permission[]): boolean {
    return permissions.some((p) => this.hasPermission(p));
  }

  /**
   * Check if principal has all specified permissions
   *
   * @param permissions - Permissions to check
   * @returns True if principal has all
   */
  hasAllPermissions(permissions: Permission[]): boolean {
    return permissions.every((p) => this.hasPermission(p));
  }

  /**
   * Require MFA verification for sensitive operations
   *
   * @throws DomainError if MFA not verified
   */
  requireMfa(): void {
    if (!this.principal.metadata.mfaVerified) {
      throw new DomainError(
        'security.mfa_required',
        'Multi-factor authentication required for this operation',
        { principalId: this.principal.id },
        ErrorSeverity.HIGH,
        this.correlationId
      );
    }
  }

  /**
   * Check if MFA is verified
   */
  isMfaVerified(): boolean {
    return this.principal.metadata.mfaVerified;
  }

  /**
   * Check if principal belongs to a specific organization
   *
   * @param organizationId - Organization ID to check
   * @returns True if principal belongs to the organization
   */
  belongsToOrganization(organizationId: string): boolean {
    return this.principal.organizationId === organizationId;
  }

  /**
   * Require principal to belong to a specific organization
   *
   * @param organizationId - Required organization ID
   * @throws DomainError if not a member
   */
  requireOrganization(organizationId: string): void {
    if (!this.belongsToOrganization(organizationId)) {
      throw new DomainError(
        'security.organization_mismatch',
        'Access denied: resource belongs to different organization',
        {
          principalOrg: this.principal.organizationId,
          requiredOrg: organizationId,
        },
        ErrorSeverity.HIGH,
        this.correlationId
      );
    }
  }

  /**
   * Check if principal has a specific role
   *
   * @param role - Role to check
   * @returns True if principal has the role
   */
  hasRole(role: string): boolean {
    return this.principal.roles.includes(role);
  }

  /**
   * Check if this is a system context
   */
  isSystemContext(): boolean {
    return this.principal.type === SecurityPrincipalType.SYSTEM;
  }

  /**
   * Create an audit entry for the current context
   *
   * @param action - Action being performed
   * @param resourceType - Type of resource
   * @param resourceId - Resource identifier
   * @param result - Action result
   * @param details - Additional details
   * @returns Audit entry ready for recording
   */
  createAuditEntry(
    action: AuditAction | string,
    resourceType: string,
    resourceId: string,
    result: 'SUCCESS' | 'FAILURE' | 'DENIED',
    details?: Record<string, unknown>
  ): AuditEntry {
    return {
      auditId: randomUUID(),
      timestamp: new Date(),
      correlationId: this.correlationId,
      principalId: this.principal.id,
      principalType: this.principal.type,
      principalRoles: this.principal.roles,
      action: action as AuditAction,
      resourceType,
      resourceId,
      organizationId: this.principal.organizationId,
      result,
      ipAddress: this.principal.metadata.ipAddress,
      userAgent: this.principal.metadata.userAgent,
      mfaVerified: this.principal.metadata.mfaVerified,
      sessionId: this.principal.metadata.sessionId,
      geoLocation: this.principal.metadata.geoLocation,
      details,
    };
  }

  /**
   * Get a safe representation for logging (no sensitive data)
   */
  toLogContext(): Record<string, unknown> {
    return {
      correlationId: this.correlationId,
      requestId: this.requestId,
      principalId: this.principal.id,
      principalType: this.principal.type,
      organizationId: this.principal.organizationId,
      roles: this.principal.roles,
      mfaVerified: this.principal.metadata.mfaVerified,
      timestamp: this.timestamp.toISOString(),
    };
  }
}
