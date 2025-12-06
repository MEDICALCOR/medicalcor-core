import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Role,
  ROLE_PERMISSIONS,
  DATA_RESIDENCY_POLICY,
  TIME_BASED_POLICY,
  MFA_POLICY,
  RATE_LIMIT_POLICY,
  PolicyEnforcer,
  getPermissionsForRoles,
  type ResourceContext,
} from '../security/RBACPolicy.js';
import {
  Permission,
  SecurityPrincipalType,
  type SecurityPrincipal,
} from '../security/SecurityContext.js';

/**
 * Tests for RBAC Policy
 *
 * Covers:
 * - Role to permission mappings
 * - Data residency policy (multi-tenancy)
 * - Time-based access policy (business hours)
 * - MFA requirement policy
 * - Policy enforcer
 * - HIPAA minimum necessary principle
 */

function createPrincipal(overrides: Partial<SecurityPrincipal> = {}): SecurityPrincipal {
  return {
    id: 'user-123',
    type: SecurityPrincipalType.USER,
    roles: ['DOCTOR'],
    permissions: ROLE_PERMISSIONS[Role.DOCTOR],
    organizationId: 'org-abc',
    metadata: { mfaVerified: true },
    ...overrides,
  };
}

function createResource(overrides: Partial<ResourceContext> = {}): ResourceContext {
  return {
    type: 'OsaxCase',
    id: 'case-123',
    organizationId: 'org-abc',
    ...overrides,
  };
}

describe('Role Permissions', () => {
  describe('DOCTOR role', () => {
    it('should have case management permissions', () => {
      const permissions = ROLE_PERMISSIONS[Role.DOCTOR];

      expect(permissions).toContain(Permission.OSAX_CASE_CREATE);
      expect(permissions).toContain(Permission.OSAX_CASE_READ);
      expect(permissions).toContain(Permission.OSAX_CASE_UPDATE);
      expect(permissions).toContain(Permission.OSAX_CASE_SCORE);
      expect(permissions).toContain(Permission.OSAX_CASE_VERIFY);
    });

    it('should have PHI read access', () => {
      expect(ROLE_PERMISSIONS[Role.DOCTOR]).toContain(Permission.PHI_READ);
    });

    it('should NOT have case delete permission', () => {
      expect(ROLE_PERMISSIONS[Role.DOCTOR]).not.toContain(Permission.OSAX_CASE_DELETE);
    });

    it('should NOT have PHI export or delete permissions', () => {
      expect(ROLE_PERMISSIONS[Role.DOCTOR]).not.toContain(Permission.PHI_EXPORT);
      expect(ROLE_PERMISSIONS[Role.DOCTOR]).not.toContain(Permission.PHI_DELETE);
    });

    it('should NOT have admin permissions', () => {
      expect(ROLE_PERMISSIONS[Role.DOCTOR]).not.toContain(Permission.ADMIN_USER_MANAGE);
      expect(ROLE_PERMISSIONS[Role.DOCTOR]).not.toContain(Permission.ADMIN_ROLE_MANAGE);
    });
  });

  describe('SURGEON role', () => {
    it('should have all doctor permissions plus more', () => {
      const surgeonPerms = ROLE_PERMISSIONS[Role.SURGEON];
      const doctorPerms = ROLE_PERMISSIONS[Role.DOCTOR];

      // Surgeon should have everything a doctor has
      for (const perm of doctorPerms) {
        expect(surgeonPerms).toContain(perm);
      }
    });

    it('should have case delete permission', () => {
      expect(ROLE_PERMISSIONS[Role.SURGEON]).toContain(Permission.OSAX_CASE_DELETE);
    });

    it('should have PHI write and export permissions', () => {
      expect(ROLE_PERMISSIONS[Role.SURGEON]).toContain(Permission.PHI_WRITE);
      expect(ROLE_PERMISSIONS[Role.SURGEON]).toContain(Permission.PHI_EXPORT);
    });

    it('should have report creation permission', () => {
      expect(ROLE_PERMISSIONS[Role.SURGEON]).toContain(Permission.REPORT_CREATE);
    });
  });

  describe('NURSE role', () => {
    it('should have read and update but NOT create', () => {
      const nursePerms = ROLE_PERMISSIONS[Role.NURSE];

      expect(nursePerms).toContain(Permission.OSAX_CASE_READ);
      expect(nursePerms).toContain(Permission.OSAX_CASE_UPDATE);
      expect(nursePerms).not.toContain(Permission.OSAX_CASE_CREATE);
      expect(nursePerms).not.toContain(Permission.OSAX_CASE_DELETE);
    });

    it('should have PHI read but NOT write', () => {
      expect(ROLE_PERMISSIONS[Role.NURSE]).toContain(Permission.PHI_READ);
      expect(ROLE_PERMISSIONS[Role.NURSE]).not.toContain(Permission.PHI_WRITE);
    });
  });

  describe('RECEPTIONIST role', () => {
    it('should only have case create and read', () => {
      const receptionistPerms = ROLE_PERMISSIONS[Role.RECEPTIONIST];

      expect(receptionistPerms).toContain(Permission.OSAX_CASE_CREATE);
      expect(receptionistPerms).toContain(Permission.OSAX_CASE_READ);
      expect(receptionistPerms).not.toContain(Permission.OSAX_CASE_UPDATE);
      expect(receptionistPerms).not.toContain(Permission.OSAX_CASE_DELETE);
    });

    it('should NOT have PHI access', () => {
      expect(ROLE_PERMISSIONS[Role.RECEPTIONIST]).not.toContain(Permission.PHI_READ);
      expect(ROLE_PERMISSIONS[Role.RECEPTIONIST]).not.toContain(Permission.PHI_WRITE);
    });
  });

  describe('ADMIN role', () => {
    it('should have ALL permissions', () => {
      const adminPerms = ROLE_PERMISSIONS[Role.ADMIN];
      const allPerms = Object.values(Permission);

      expect(adminPerms).toEqual(allPerms);
    });
  });

  describe('SYSTEM role', () => {
    it('should have ALL permissions', () => {
      const systemPerms = ROLE_PERMISSIONS[Role.SYSTEM];
      const allPerms = Object.values(Permission);

      expect(systemPerms).toEqual(allPerms);
    });
  });

  describe('AUDITOR role', () => {
    it('should have audit view and case read only', () => {
      const auditorPerms = ROLE_PERMISSIONS[Role.AUDITOR];

      expect(auditorPerms).toContain(Permission.ADMIN_AUDIT_VIEW);
      expect(auditorPerms).toContain(Permission.OSAX_CASE_READ);
      expect(auditorPerms).toContain(Permission.REPORT_VIEW);
      expect(auditorPerms).not.toContain(Permission.OSAX_CASE_CREATE);
      expect(auditorPerms).not.toContain(Permission.OSAX_CASE_UPDATE);
      expect(auditorPerms).not.toContain(Permission.PHI_READ);
    });
  });

  describe('RESEARCHER role', () => {
    it('should have read-only access for analytics', () => {
      const researcherPerms = ROLE_PERMISSIONS[Role.RESEARCHER];

      expect(researcherPerms).toContain(Permission.OSAX_CASE_READ);
      expect(researcherPerms).toContain(Permission.REPORT_VIEW);
      expect(researcherPerms).not.toContain(Permission.PHI_READ); // No direct PHI
      expect(researcherPerms).not.toContain(Permission.OSAX_CASE_UPDATE);
    });
  });

  describe('CONSULTANT role', () => {
    it('should have minimal read-only access', () => {
      const consultantPerms = ROLE_PERMISSIONS[Role.CONSULTANT];

      expect(consultantPerms).toEqual([Permission.OSAX_CASE_READ]);
    });
  });

  describe('BILLING role', () => {
    it('should have financial data access only', () => {
      const billingPerms = ROLE_PERMISSIONS[Role.BILLING];

      expect(billingPerms).toContain(Permission.OSAX_CASE_READ);
      expect(billingPerms).toContain(Permission.REPORT_VIEW);
      expect(billingPerms).toContain(Permission.REPORT_EXPORT);
      expect(billingPerms).not.toContain(Permission.PHI_READ);
      expect(billingPerms).not.toContain(Permission.OSAX_CASE_UPDATE);
    });
  });
});

describe('Data Residency Policy', () => {
  it('should allow access when organization matches', () => {
    const principal = createPrincipal({ organizationId: 'org-abc' });
    const resource = createResource({ organizationId: 'org-abc' });

    const result = DATA_RESIDENCY_POLICY.check(principal, resource, Permission.OSAX_CASE_READ);

    expect(result.allowed).toBe(true);
    expect(result.policy).toBe('data_residency');
  });

  it('should deny access when organization differs', () => {
    const principal = createPrincipal({ organizationId: 'org-abc' });
    const resource = createResource({ organizationId: 'org-xyz' });

    const result = DATA_RESIDENCY_POLICY.check(principal, resource, Permission.OSAX_CASE_READ);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('different organization');
  });

  it('should allow system principals to bypass org check', () => {
    const systemPrincipal = createPrincipal({ type: SecurityPrincipalType.SYSTEM });
    const resource = createResource({ organizationId: 'any-org' });

    const result = DATA_RESIDENCY_POLICY.check(
      systemPrincipal,
      resource,
      Permission.OSAX_CASE_READ
    );

    expect(result.allowed).toBe(true);
  });

  it('should allow access when resource has no organization', () => {
    const principal = createPrincipal({ organizationId: 'org-abc' });
    const resource = createResource({ organizationId: undefined });

    const result = DATA_RESIDENCY_POLICY.check(principal, resource, Permission.OSAX_CASE_READ);

    expect(result.allowed).toBe(true);
  });
});

describe('Time-Based Access Policy', () => {
  function mockTime(hour: number) {
    const mockDate = new Date();
    mockDate.setHours(hour, 0, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow non-sensitive actions at any time', () => {
    mockTime(2); // 2 AM - outside business hours
    const principal = createPrincipal();
    const resource = createResource();

    const result = TIME_BASED_POLICY.check(principal, resource, Permission.OSAX_CASE_READ);

    expect(result.allowed).toBe(true);
  });

  it('should allow sensitive actions during business hours (8am-6pm)', () => {
    mockTime(14); // 2 PM - business hours
    const principal = createPrincipal();
    const resource = createResource();

    const result = TIME_BASED_POLICY.check(principal, resource, Permission.PHI_EXPORT);

    expect(result.allowed).toBe(true);
  });

  it('should deny PHI_EXPORT outside business hours', () => {
    mockTime(22); // 10 PM
    const principal = createPrincipal();
    const resource = createResource();

    const result = TIME_BASED_POLICY.check(principal, resource, Permission.PHI_EXPORT);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('business hours');
  });

  it('should deny PHI_DELETE outside business hours', () => {
    mockTime(3); // 3 AM
    const principal = createPrincipal();
    const resource = createResource();

    const result = TIME_BASED_POLICY.check(principal, resource, Permission.PHI_DELETE);

    expect(result.allowed).toBe(false);
  });

  it('should deny OSAX_CASE_DELETE outside business hours', () => {
    mockTime(20); // 8 PM
    const principal = createPrincipal();
    const resource = createResource();

    const result = TIME_BASED_POLICY.check(principal, resource, Permission.OSAX_CASE_DELETE);

    expect(result.allowed).toBe(false);
  });

  it('should allow system principals to bypass time check', () => {
    mockTime(3); // 3 AM
    const systemPrincipal = createPrincipal({ type: SecurityPrincipalType.SYSTEM });
    const resource = createResource();

    const result = TIME_BASED_POLICY.check(systemPrincipal, resource, Permission.PHI_EXPORT);

    expect(result.allowed).toBe(true);
  });

  it('should allow at edge of business hours (8 AM)', () => {
    mockTime(8);
    const principal = createPrincipal();
    const resource = createResource();

    const result = TIME_BASED_POLICY.check(principal, resource, Permission.PHI_EXPORT);

    expect(result.allowed).toBe(true);
  });

  it('should deny at edge of business hours (6 PM)', () => {
    mockTime(18); // 6 PM - just outside
    const principal = createPrincipal();
    const resource = createResource();

    const result = TIME_BASED_POLICY.check(principal, resource, Permission.PHI_EXPORT);

    expect(result.allowed).toBe(false);
  });
});

describe('MFA Policy', () => {
  it('should allow non-MFA-required actions without MFA', () => {
    const principal = createPrincipal({
      metadata: { mfaVerified: false },
    });
    const resource = createResource();

    const result = MFA_POLICY.check(principal, resource, Permission.OSAX_CASE_READ);

    expect(result.allowed).toBe(true);
  });

  it('should require MFA for PHI_EXPORT', () => {
    const principal = createPrincipal({
      metadata: { mfaVerified: false },
    });
    const resource = createResource();

    const result = MFA_POLICY.check(principal, resource, Permission.PHI_EXPORT);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Multi-factor authentication');
  });

  it('should allow PHI_EXPORT with MFA verified', () => {
    const principal = createPrincipal({
      metadata: { mfaVerified: true },
    });
    const resource = createResource();

    const result = MFA_POLICY.check(principal, resource, Permission.PHI_EXPORT);

    expect(result.allowed).toBe(true);
  });

  it('should require MFA for ADMIN_USER_MANAGE', () => {
    const principal = createPrincipal({
      metadata: { mfaVerified: false },
    });
    const resource = createResource();

    const result = MFA_POLICY.check(principal, resource, Permission.ADMIN_USER_MANAGE);

    expect(result.allowed).toBe(false);
  });

  it('should require MFA for ADMIN_SYSTEM_CONFIG', () => {
    const principal = createPrincipal({
      metadata: { mfaVerified: false },
    });
    const resource = createResource();

    const result = MFA_POLICY.check(principal, resource, Permission.ADMIN_SYSTEM_CONFIG);

    expect(result.allowed).toBe(false);
  });

  it('should allow system principals to bypass MFA', () => {
    const systemPrincipal = createPrincipal({
      type: SecurityPrincipalType.SYSTEM,
      metadata: { mfaVerified: false }, // Even without MFA
    });
    const resource = createResource();

    const result = MFA_POLICY.check(systemPrincipal, resource, Permission.PHI_EXPORT);

    expect(result.allowed).toBe(true);
  });
});

describe('Rate Limit Policy', () => {
  it('should always allow (placeholder implementation)', () => {
    const principal = createPrincipal();
    const resource = createResource();

    const result = RATE_LIMIT_POLICY.check(principal, resource, Permission.OSAX_CASE_READ);

    expect(result.allowed).toBe(true);
    expect(result.policy).toBe('rate_limit');
  });
});

describe('PolicyEnforcer', () => {
  describe('enforce', () => {
    it('should return true when all policies pass', () => {
      const enforcer = new PolicyEnforcer([DATA_RESIDENCY_POLICY, RATE_LIMIT_POLICY]);
      const principal = createPrincipal({ organizationId: 'org-abc' });
      const resource = createResource({ organizationId: 'org-abc' });

      const result = enforcer.enforce(principal, resource, Permission.OSAX_CASE_READ);

      expect(result).toBe(true);
    });

    it('should return false when any policy fails', () => {
      const enforcer = new PolicyEnforcer([DATA_RESIDENCY_POLICY]);
      const principal = createPrincipal({ organizationId: 'org-abc' });
      const resource = createResource({ organizationId: 'org-different' });

      const result = enforcer.enforce(principal, resource, Permission.OSAX_CASE_READ);

      expect(result).toBe(false);
    });
  });

  describe('getViolations', () => {
    it('should return empty array when no violations', () => {
      const enforcer = new PolicyEnforcer([DATA_RESIDENCY_POLICY, RATE_LIMIT_POLICY]);
      const principal = createPrincipal({ organizationId: 'org-abc' });
      const resource = createResource({ organizationId: 'org-abc' });

      const violations = enforcer.getViolations(principal, resource, Permission.OSAX_CASE_READ);

      expect(violations).toEqual([]);
    });

    it('should return all violations', () => {
      const enforcer = new PolicyEnforcer([DATA_RESIDENCY_POLICY, MFA_POLICY]);
      const principal = createPrincipal({
        organizationId: 'org-abc',
        metadata: { mfaVerified: false },
      });
      const resource = createResource({ organizationId: 'org-different' });

      const violations = enforcer.getViolations(principal, resource, Permission.PHI_EXPORT);

      expect(violations.length).toBe(2);
      expect(violations.map((v) => v.policy)).toContain('data_residency');
      expect(violations.map((v) => v.policy)).toContain('mfa_required');
    });
  });

  describe('evaluateAll', () => {
    it('should return results for all policies', () => {
      const enforcer = new PolicyEnforcer([DATA_RESIDENCY_POLICY, MFA_POLICY, RATE_LIMIT_POLICY]);
      const principal = createPrincipal();
      const resource = createResource();

      const results = enforcer.evaluateAll(principal, resource, Permission.OSAX_CASE_READ);

      expect(results.length).toBe(3);
    });

    it('should include both passed and failed policies', () => {
      const enforcer = new PolicyEnforcer([DATA_RESIDENCY_POLICY, MFA_POLICY]);
      const principal = createPrincipal({
        organizationId: 'org-abc',
        metadata: { mfaVerified: false },
      });
      const resource = createResource({ organizationId: 'org-abc' });

      const results = enforcer.evaluateAll(principal, resource, Permission.PHI_EXPORT);

      expect(results.find((r) => r.policy === 'data_residency')?.allowed).toBe(true);
      expect(results.find((r) => r.policy === 'mfa_required')?.allowed).toBe(false);
    });
  });
});

describe('getPermissionsForRoles', () => {
  it('should return permissions for a single role', () => {
    const permissions = getPermissionsForRoles(['DOCTOR']);

    expect(permissions).toEqual(expect.arrayContaining(ROLE_PERMISSIONS[Role.DOCTOR]));
  });

  it('should combine permissions for multiple roles', () => {
    const permissions = getPermissionsForRoles(['NURSE', 'AUDITOR']);

    expect(permissions).toContain(Permission.OSAX_CASE_READ); // Both have
    expect(permissions).toContain(Permission.OSAX_CASE_UPDATE); // Nurse
    expect(permissions).toContain(Permission.ADMIN_AUDIT_VIEW); // Auditor
  });

  it('should deduplicate permissions', () => {
    const permissions = getPermissionsForRoles(['DOCTOR', 'SURGEON']);

    // OSAX_CASE_READ is in both - should only appear once
    const readCount = permissions.filter((p) => p === Permission.OSAX_CASE_READ).length;
    expect(readCount).toBe(1);
  });

  it('should return empty array for unknown roles', () => {
    const permissions = getPermissionsForRoles(['UNKNOWN_ROLE']);

    expect(permissions).toEqual([]);
  });

  it('should handle empty roles array', () => {
    const permissions = getPermissionsForRoles([]);

    expect(permissions).toEqual([]);
  });

  it('should handle mix of valid and invalid roles', () => {
    const permissions = getPermissionsForRoles(['DOCTOR', 'INVALID', 'NURSE']);

    expect(permissions).toContain(Permission.OSAX_CASE_CREATE); // Doctor
    expect(permissions).toContain(Permission.OSAX_CASE_UPDATE); // Nurse
    expect(permissions.length).toBeGreaterThan(0);
  });
});

describe('HIPAA Minimum Necessary Principle', () => {
  it('should ensure clinical roles have appropriate clinical access', () => {
    // Surgeons have most clinical permissions
    expect(ROLE_PERMISSIONS[Role.SURGEON]).toContain(Permission.PHI_READ);
    expect(ROLE_PERMISSIONS[Role.SURGEON]).toContain(Permission.PHI_WRITE);

    // Doctors have read access
    expect(ROLE_PERMISSIONS[Role.DOCTOR]).toContain(Permission.PHI_READ);

    // Nurses have limited read
    expect(ROLE_PERMISSIONS[Role.NURSE]).toContain(Permission.PHI_READ);
  });

  it('should ensure non-clinical roles have no PHI access', () => {
    expect(ROLE_PERMISSIONS[Role.RECEPTIONIST]).not.toContain(Permission.PHI_READ);
    expect(ROLE_PERMISSIONS[Role.AUDITOR]).not.toContain(Permission.PHI_READ);
    expect(ROLE_PERMISSIONS[Role.BILLING]).not.toContain(Permission.PHI_READ);
    expect(ROLE_PERMISSIONS[Role.RESEARCHER]).not.toContain(Permission.PHI_READ);
  });

  it('should ensure only admin can manage users', () => {
    const rolesWithUserManage = Object.entries(ROLE_PERMISSIONS)
      .filter(([_, perms]) => perms.includes(Permission.ADMIN_USER_MANAGE))
      .map(([role]) => role);

    expect(rolesWithUserManage).toContain(Role.ADMIN);
    expect(rolesWithUserManage).toContain(Role.SYSTEM);
    expect(rolesWithUserManage.length).toBe(2);
  });

  it('should ensure delete permissions are restricted', () => {
    const rolesWithCaseDelete = Object.entries(ROLE_PERMISSIONS)
      .filter(([_, perms]) => perms.includes(Permission.OSAX_CASE_DELETE))
      .map(([role]) => role);

    expect(rolesWithCaseDelete).toContain(Role.SURGEON);
    expect(rolesWithCaseDelete).toContain(Role.ADMIN);
    expect(rolesWithCaseDelete).toContain(Role.SYSTEM);
    expect(rolesWithCaseDelete).not.toContain(Role.DOCTOR);
    expect(rolesWithCaseDelete).not.toContain(Role.NURSE);
  });
});
