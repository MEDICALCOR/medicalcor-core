/**
 * @module architecture/security/authorization
 *
 * Authorization Infrastructure
 * ============================
 *
 * Role-Based Access Control (RBAC) and Attribute-Based Access Control (ABAC)
 * with policy enforcement.
 */

import type { Result } from '../../types/result.js';
import { Ok, Err } from '../../types/result.js';
import type { Identity } from './authentication.js';

// ============================================================================
// AUTHORIZATION TYPES
// ============================================================================

/**
 * Authorization decision
 */
export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly policy?: string;
  readonly conditions?: AuthorizationCondition[];
}

export interface AuthorizationCondition {
  readonly type: string;
  readonly value: unknown;
}

/**
 * Resource being accessed
 */
export interface Resource {
  readonly type: string;
  readonly id?: string;
  readonly attributes?: Record<string, unknown>;
  readonly owner?: string;
  readonly tenantId?: string;
}

/**
 * Action being performed
 */
export interface Action {
  readonly name: string;
  readonly attributes?: Record<string, unknown>;
}

/**
 * Authorization context
 */
export interface AuthorizationContext {
  readonly subject: Identity;
  readonly resource: Resource;
  readonly action: Action;
  readonly environment?: EnvironmentContext;
}

export interface EnvironmentContext {
  readonly timestamp: Date;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly requestId?: string;
  readonly location?: GeoLocation;
}

export interface GeoLocation {
  readonly country?: string;
  readonly region?: string;
  readonly city?: string;
}

// ============================================================================
// RBAC (ROLE-BASED ACCESS CONTROL)
// ============================================================================

/**
 * Role definition
 */
export interface Role {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly permissions: Permission[];
  readonly inheritsFrom?: string[];
  readonly constraints?: RoleConstraint[];
}

/**
 * Permission definition
 */
export interface Permission {
  readonly id: string;
  readonly resource: string;
  readonly actions: string[];
  readonly conditions?: PermissionCondition[];
}

export interface PermissionCondition {
  readonly type: 'owner' | 'tenant' | 'attribute' | 'time' | 'custom';
  readonly operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than';
  readonly field?: string;
  readonly value: unknown;
}

export interface RoleConstraint {
  readonly type: 'time_based' | 'location_based' | 'device_based' | 'custom';
  readonly config: Record<string, unknown>;
}

/**
 * RBAC authorization service
 */
export class RBACAuthorizationService {
  private roles = new Map<string, Role>();
  private roleHierarchy = new Map<string, Set<string>>();

  /**
   * Register a role
   */
  registerRole(role: Role): void {
    this.roles.set(role.id, role);
    this.updateRoleHierarchy();
  }

  /**
   * Check authorization
   */
  authorize(context: AuthorizationContext): AuthorizationDecision {
    const { subject, resource, action } = context;

    // Get all effective roles (including inherited)
    const effectiveRoles = this.getEffectiveRoles(subject.roles);

    // Check each role's permissions
    for (const roleId of effectiveRoles) {
      const role = this.roles.get(roleId);
      if (!role) continue;

      // Check role constraints
      if (role.constraints && !this.checkConstraints(role.constraints, context)) {
        continue;
      }

      // Check permissions
      for (const permission of role.permissions) {
        if (this.permissionMatches(permission, resource, action, context)) {
          return {
            allowed: true,
            reason: `Allowed by role ${role.name}, permission ${permission.id}`,
            policy: `rbac:${role.id}:${permission.id}`,
          };
        }
      }
    }

    return {
      allowed: false,
      reason: 'No matching permission found',
    };
  }

  private getEffectiveRoles(roleIds: string[]): Set<string> {
    const effective = new Set<string>();

    for (const roleId of roleIds) {
      effective.add(roleId);
      const inherited = this.roleHierarchy.get(roleId);
      if (inherited) {
        for (const inheritedRole of inherited) {
          effective.add(inheritedRole);
        }
      }
    }

    return effective;
  }

  private updateRoleHierarchy(): void {
    for (const role of this.roles.values()) {
      if (role.inheritsFrom) {
        const inherited = new Set<string>();
        this.collectInheritedRoles(role.inheritsFrom, inherited);
        this.roleHierarchy.set(role.id, inherited);
      }
    }
  }

  private collectInheritedRoles(roleIds: string[], collected: Set<string>): void {
    for (const roleId of roleIds) {
      if (collected.has(roleId)) continue;
      collected.add(roleId);

      const role = this.roles.get(roleId);
      if (role?.inheritsFrom) {
        this.collectInheritedRoles(role.inheritsFrom, collected);
      }
    }
  }

  private checkConstraints(constraints: RoleConstraint[], context: AuthorizationContext): boolean {
    for (const constraint of constraints) {
      if (!this.checkConstraint(constraint, context)) {
        return false;
      }
    }
    return true;
  }

  private checkConstraint(constraint: RoleConstraint, context: AuthorizationContext): boolean {
    switch (constraint.type) {
      case 'time_based':
        return this.checkTimeConstraint(constraint.config, context);
      case 'location_based':
        return this.checkLocationConstraint(constraint.config, context);
      default:
        return true;
    }
  }

  private checkTimeConstraint(
    config: Record<string, unknown>,
    context: AuthorizationContext
  ): boolean {
    const now = context.environment?.timestamp ?? new Date();
    const hour = now.getHours();

    const startHour = config.startHour as number | undefined;
    const endHour = config.endHour as number | undefined;

    if (startHour !== undefined && hour < startHour) return false;
    if (endHour !== undefined && hour > endHour) return false;

    return true;
  }

  private checkLocationConstraint(
    config: Record<string, unknown>,
    context: AuthorizationContext
  ): boolean {
    const location = context.environment?.location;
    if (!location) return true;

    const allowedCountries = config.allowedCountries as string[] | undefined;
    if (allowedCountries && location.country && !allowedCountries.includes(location.country)) {
      return false;
    }

    return true;
  }

  private permissionMatches(
    permission: Permission,
    resource: Resource,
    action: Action,
    context: AuthorizationContext
  ): boolean {
    // Check resource type
    if (permission.resource !== '*' && permission.resource !== resource.type) {
      return false;
    }

    // Check action
    if (!permission.actions.includes('*') && !permission.actions.includes(action.name)) {
      return false;
    }

    // Check conditions
    if (permission.conditions) {
      for (const condition of permission.conditions) {
        if (!this.checkCondition(condition, context)) {
          return false;
        }
      }
    }

    return true;
  }

  private checkCondition(condition: PermissionCondition, context: AuthorizationContext): boolean {
    switch (condition.type) {
      case 'owner':
        return context.resource.owner === context.subject.id;

      case 'tenant':
        return context.resource.tenantId === context.subject.tenantId;

      case 'attribute':
        if (!condition.field || !context.resource.attributes) return true;
        const value = context.resource.attributes[condition.field];
        return this.compareValue(value, condition.operator, condition.value);

      default:
        return true;
    }
  }

  private compareValue(
    actual: unknown,
    operator: PermissionCondition['operator'],
    expected: unknown
  ): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual);
      case 'greater_than':
        return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      case 'less_than':
        return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      default:
        return false;
    }
  }
}

// ============================================================================
// ABAC (ATTRIBUTE-BASED ACCESS CONTROL)
// ============================================================================

/**
 * ABAC Policy
 */
export interface ABACPolicy {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly effect: 'allow' | 'deny';
  readonly priority: number;
  readonly rules: ABACRule[];
}

export interface ABACRule {
  readonly subject?: ABACCondition[];
  readonly resource?: ABACCondition[];
  readonly action?: ABACCondition[];
  readonly environment?: ABACCondition[];
}

export interface ABACCondition {
  readonly attribute: string;
  readonly operator: string;
  readonly value: unknown;
}

/**
 * ABAC authorization service
 */
export class ABACAuthorizationService {
  private policies: ABACPolicy[] = [];

  /**
   * Register a policy
   */
  registerPolicy(policy: ABACPolicy): void {
    this.policies.push(policy);
    this.policies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Evaluate authorization
   */
  authorize(context: AuthorizationContext): AuthorizationDecision {
    for (const policy of this.policies) {
      const matches = this.evaluatePolicy(policy, context);
      if (matches) {
        return {
          allowed: policy.effect === 'allow',
          reason: `${policy.effect} by policy ${policy.name}`,
          policy: `abac:${policy.id}`,
        };
      }
    }

    // Default deny
    return {
      allowed: false,
      reason: 'No matching policy found',
    };
  }

  private evaluatePolicy(policy: ABACPolicy, context: AuthorizationContext): boolean {
    for (const rule of policy.rules) {
      if (this.evaluateRule(rule, context)) {
        return true;
      }
    }
    return false;
  }

  private evaluateRule(rule: ABACRule, context: AuthorizationContext): boolean {
    if (rule.subject && !this.evaluateConditions(rule.subject, context.subject)) {
      return false;
    }
    if (rule.resource && !this.evaluateConditions(rule.resource, context.resource)) {
      return false;
    }
    if (rule.action && !this.evaluateConditions(rule.action, context.action)) {
      return false;
    }
    if (
      rule.environment &&
      context.environment &&
      !this.evaluateConditions(rule.environment, context.environment)
    ) {
      return false;
    }
    return true;
  }

  private evaluateConditions(conditions: ABACCondition[], target: object): boolean {
    for (const condition of conditions) {
      const value = this.getAttributeValue(target, condition.attribute);
      if (!this.evaluateCondition(value, condition.operator, condition.value)) {
        return false;
      }
    }
    return true;
  }

  private getAttributeValue(target: object, attribute: string): unknown {
    const parts = attribute.split('.');
    let value: unknown = target;

    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = (value as Record<string, unknown>)[part];
    }

    return value;
  }

  private evaluateCondition(actual: unknown, operator: string, expected: unknown): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'contains':
        return typeof actual === 'string' && actual.includes(String(expected));
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'regex':
        return typeof actual === 'string' && new RegExp(String(expected)).test(actual);
      default:
        return false;
    }
  }
}

// ============================================================================
// AUTHORIZATION ENFORCER
// ============================================================================

/**
 * Combined authorization enforcer
 */
export class AuthorizationEnforcer {
  constructor(
    private rbac: RBACAuthorizationService,
    private abac: ABACAuthorizationService
  ) {}

  /**
   * Check authorization (RBAC first, then ABAC)
   */
  async authorize(context: AuthorizationContext): Promise<AuthorizationDecision> {
    // Try RBAC first
    const rbacDecision = this.rbac.authorize(context);
    if (rbacDecision.allowed) {
      // Check ABAC for potential deny
      const abacDecision = this.abac.authorize(context);
      if (!abacDecision.allowed) {
        return abacDecision;
      }
      return rbacDecision;
    }

    // Try ABAC
    return this.abac.authorize(context);
  }

  /**
   * Require authorization (throws if not allowed)
   */
  async require(context: AuthorizationContext): Promise<void> {
    const decision = await this.authorize(context);
    if (!decision.allowed) {
      throw new AuthorizationError(decision.reason ?? 'Not authorized');
    }
  }
}

export class AuthorizationError extends Error {
  readonly code = 'AUTHORIZATION_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

// Default instances
export const rbacService = new RBACAuthorizationService();
export const abacService = new ABACAuthorizationService();
export const authorizationEnforcer = new AuthorizationEnforcer(rbacService, abacService);
