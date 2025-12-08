import { describe, it, expect } from 'vitest';
import {
  SecurityContext,
  Permission,
  SecurityPrincipalType,
  type SecurityPrincipal,
} from '../security/SecurityContext.js';
import { DomainError } from '../shared/DomainError.js';

/**
 * Tests for SecurityContext
 *
 * Covers:
 * - Context creation
 * - Permission checking
 * - MFA verification
 * - Organization membership
 * - Role checking
 * - Audit entry creation
 * - System context creation
 */

function createPrincipal(overrides: Partial<SecurityPrincipal> = {}): SecurityPrincipal {
  return {
    id: 'user-123',
    type: SecurityPrincipalType.USER,
    roles: ['DOCTOR'],
    permissions: [Permission.CASE_READ, Permission.CASE_CREATE],
    organizationId: 'org-456',
    displayName: 'Dr. Test',
    email: 'test@clinic.com',
    metadata: {
      mfaVerified: true,
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      sessionId: 'session-abc',
      authMethod: 'password',
    },
    ...overrides,
  };
}

describe('SecurityContext', () => {
  describe('Creation', () => {
    it('should create context with principal and correlation ID', () => {
      const principal = createPrincipal();
      const context = SecurityContext.create(principal, 'corr-123');

      expect(context.principal).toBe(principal);
      expect(context.correlationId).toBe('corr-123');
    });

    it('should generate unique request ID', () => {
      const principal = createPrincipal();
      const context1 = SecurityContext.create(principal, 'corr-1');
      const context2 = SecurityContext.create(principal, 'corr-2');

      expect(context1.requestId).not.toBe(context2.requestId);
      expect(context1.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should set timestamp to current time', () => {
      const before = new Date();
      const context = SecurityContext.create(createPrincipal(), 'corr-123');
      const after = new Date();

      expect(context.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(context.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('System Context', () => {
    it('should create system context with full permissions', () => {
      const context = SecurityContext.createSystemContext('corr-sys-123');

      expect(context.principal.type).toBe(SecurityPrincipalType.SYSTEM);
      expect(context.principal.roles).toContain('SYSTEM');
      expect(context.principal.permissions).toEqual(Object.values(Permission));
    });

    it('should use provided system ID', () => {
      const context = SecurityContext.createSystemContext('corr-123', 'CRON_JOB');

      expect(context.principal.id).toBe('CRON_JOB');
    });

    it('should default to "SYSTEM" ID when not provided', () => {
      const context = SecurityContext.createSystemContext('corr-123');

      expect(context.principal.id).toBe('SYSTEM');
    });

    it('should mark system context as MFA verified', () => {
      const context = SecurityContext.createSystemContext('corr-123');

      expect(context.principal.metadata.mfaVerified).toBe(true);
    });

    it('should set auth method to service_token', () => {
      const context = SecurityContext.createSystemContext('corr-123');

      expect(context.principal.metadata.authMethod).toBe('service_token');
    });
  });

  describe('Permission Checking', () => {
    it('should return true for hasPermission when permission exists', () => {
      const principal = createPrincipal({ permissions: [Permission.CASE_CREATE] });
      const context = SecurityContext.create(principal, 'corr-123');

      expect(context.hasPermission(Permission.CASE_CREATE)).toBe(true);
    });

    it('should return false for hasPermission when permission is missing', () => {
      const principal = createPrincipal({ permissions: [Permission.CASE_READ] });
      const context = SecurityContext.create(principal, 'corr-123');

      expect(context.hasPermission(Permission.CASE_DELETE)).toBe(false);
    });

    it('should not throw for requirePermission when permission exists', () => {
      const principal = createPrincipal({ permissions: [Permission.CASE_CREATE] });
      const context = SecurityContext.create(principal, 'corr-123');

      expect(() => context.requirePermission(Permission.CASE_CREATE)).not.toThrow();
    });

    it('should throw DomainError for requirePermission when permission is missing', () => {
      const principal = createPrincipal({ permissions: [] });
      const context = SecurityContext.create(principal, 'corr-123');

      expect(() => context.requirePermission(Permission.CASE_CREATE)).toThrow(DomainError);
    });

    it('should include required permission in error details', () => {
      const principal = createPrincipal({ permissions: [] });
      const context = SecurityContext.create(principal, 'corr-123');

      try {
        context.requirePermission(Permission.CASE_CREATE);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        const domainError = error as DomainError;
        expect(domainError.code).toBe('security.permission_denied');
        expect(domainError.details?.requiredPermission).toBe(Permission.CASE_CREATE);
      }
    });

    it('should check hasAnyPermission correctly', () => {
      const principal = createPrincipal({
        permissions: [Permission.CASE_READ],
      });
      const context = SecurityContext.create(principal, 'corr-123');

      expect(context.hasAnyPermission([Permission.CASE_READ, Permission.CASE_CREATE])).toBe(true);
      expect(context.hasAnyPermission([Permission.CASE_DELETE, Permission.PHI_DELETE])).toBe(false);
    });

    it('should check hasAllPermissions correctly', () => {
      const principal = createPrincipal({
        permissions: [Permission.CASE_READ, Permission.CASE_CREATE],
      });
      const context = SecurityContext.create(principal, 'corr-123');

      expect(context.hasAllPermissions([Permission.CASE_READ, Permission.CASE_CREATE])).toBe(true);
      expect(context.hasAllPermissions([Permission.CASE_READ, Permission.CASE_DELETE])).toBe(false);
    });
  });

  describe('MFA Verification', () => {
    it('should return true for isMfaVerified when MFA is verified', () => {
      const principal = createPrincipal({
        metadata: { mfaVerified: true, ipAddress: '1.1.1.1' },
      });
      const context = SecurityContext.create(principal, 'corr-123');

      expect(context.isMfaVerified()).toBe(true);
    });

    it('should return false for isMfaVerified when MFA is not verified', () => {
      const principal = createPrincipal({
        metadata: { mfaVerified: false, ipAddress: '1.1.1.1' },
      });
      const context = SecurityContext.create(principal, 'corr-123');

      expect(context.isMfaVerified()).toBe(false);
    });

    it('should not throw for requireMfa when MFA is verified', () => {
      const principal = createPrincipal({
        metadata: { mfaVerified: true, ipAddress: '1.1.1.1' },
      });
      const context = SecurityContext.create(principal, 'corr-123');

      expect(() => context.requireMfa()).not.toThrow();
    });

    it('should throw DomainError for requireMfa when MFA is not verified', () => {
      const principal = createPrincipal({
        metadata: { mfaVerified: false, ipAddress: '1.1.1.1' },
      });
      const context = SecurityContext.create(principal, 'corr-123');

      expect(() => context.requireMfa()).toThrow(DomainError);
    });

    it('should include correct error code for MFA failure', () => {
      const principal = createPrincipal({
        metadata: { mfaVerified: false, ipAddress: '1.1.1.1' },
      });
      const context = SecurityContext.create(principal, 'corr-123');

      try {
        context.requireMfa();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('security.mfa_required');
      }
    });
  });

  describe('Organization Membership', () => {
    it('should return true for belongsToOrganization when org matches', () => {
      const principal = createPrincipal({ organizationId: 'org-abc' });
      const context = SecurityContext.create(principal, 'corr-123');

      expect(context.belongsToOrganization('org-abc')).toBe(true);
    });

    it('should return false for belongsToOrganization when org differs', () => {
      const principal = createPrincipal({ organizationId: 'org-abc' });
      const context = SecurityContext.create(principal, 'corr-123');

      expect(context.belongsToOrganization('org-xyz')).toBe(false);
    });

    it('should not throw for requireOrganization when org matches', () => {
      const principal = createPrincipal({ organizationId: 'org-abc' });
      const context = SecurityContext.create(principal, 'corr-123');

      expect(() => context.requireOrganization('org-abc')).not.toThrow();
    });

    it('should throw DomainError for requireOrganization when org differs', () => {
      const principal = createPrincipal({ organizationId: 'org-abc' });
      const context = SecurityContext.create(principal, 'corr-123');

      expect(() => context.requireOrganization('org-xyz')).toThrow(DomainError);
    });

    it('should include both org IDs in error details', () => {
      const principal = createPrincipal({ organizationId: 'org-abc' });
      const context = SecurityContext.create(principal, 'corr-123');

      try {
        context.requireOrganization('org-xyz');
        expect.fail('Should have thrown');
      } catch (error) {
        const domainError = error as DomainError;
        expect(domainError.code).toBe('security.organization_mismatch');
        expect(domainError.details?.principalOrg).toBe('org-abc');
        expect(domainError.details?.requiredOrg).toBe('org-xyz');
      }
    });
  });

  describe('Role Checking', () => {
    it('should return true for hasRole when role exists', () => {
      const principal = createPrincipal({ roles: ['DOCTOR', 'ADMIN'] });
      const context = SecurityContext.create(principal, 'corr-123');

      expect(context.hasRole('DOCTOR')).toBe(true);
      expect(context.hasRole('ADMIN')).toBe(true);
    });

    it('should return false for hasRole when role is missing', () => {
      const principal = createPrincipal({ roles: ['NURSE'] });
      const context = SecurityContext.create(principal, 'corr-123');

      expect(context.hasRole('DOCTOR')).toBe(false);
    });

    it('should identify system context correctly', () => {
      const systemContext = SecurityContext.createSystemContext('corr-123');
      const userContext = SecurityContext.create(createPrincipal(), 'corr-123');

      expect(systemContext.isSystemContext()).toBe(true);
      expect(userContext.isSystemContext()).toBe(false);
    });
  });

  describe('Audit Entry Creation', () => {
    it('should create audit entry with correct fields', () => {
      const principal = createPrincipal({
        id: 'user-xyz',
        roles: ['DOCTOR'],
        organizationId: 'org-123',
        metadata: {
          mfaVerified: true,
          ipAddress: '10.0.0.1',
          userAgent: 'Test/1.0',
          sessionId: 'sess-abc',
        },
      });
      const context = SecurityContext.create(principal, 'corr-456');

      const entry = context.createAuditEntry('CREATE', 'Case', 'case-789', 'SUCCESS', {
        extra: 'data',
      });

      expect(entry.auditId).toBeDefined();
      expect(entry.correlationId).toBe('corr-456');
      expect(entry.principalId).toBe('user-xyz');
      expect(entry.principalType).toBe(SecurityPrincipalType.USER);
      expect(entry.principalRoles).toEqual(['DOCTOR']);
      expect(entry.action).toBe('CREATE');
      expect(entry.resourceType).toBe('Case');
      expect(entry.resourceId).toBe('case-789');
      expect(entry.organizationId).toBe('org-123');
      expect(entry.result).toBe('SUCCESS');
      expect(entry.ipAddress).toBe('10.0.0.1');
      expect(entry.userAgent).toBe('Test/1.0');
      expect(entry.mfaVerified).toBe(true);
      expect(entry.sessionId).toBe('sess-abc');
      expect(entry.details).toEqual({ extra: 'data' });
    });

    it('should include timestamp in audit entry', () => {
      const context = SecurityContext.create(createPrincipal(), 'corr-123');
      const before = new Date();
      const entry = context.createAuditEntry('READ', 'Case', 'case-1', 'SUCCESS');
      const after = new Date();

      expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entry.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should generate unique audit IDs', () => {
      const context = SecurityContext.create(createPrincipal(), 'corr-123');

      const entry1 = context.createAuditEntry('READ', 'Case', 'case-1', 'SUCCESS');
      const entry2 = context.createAuditEntry('READ', 'Case', 'case-1', 'SUCCESS');

      expect(entry1.auditId).not.toBe(entry2.auditId);
    });

    it('should support FAILURE and DENIED results', () => {
      const context = SecurityContext.create(createPrincipal(), 'corr-123');

      const failureEntry = context.createAuditEntry('CREATE', 'Case', 'case-1', 'FAILURE');
      const deniedEntry = context.createAuditEntry('DELETE', 'Case', 'case-2', 'DENIED');

      expect(failureEntry.result).toBe('FAILURE');
      expect(deniedEntry.result).toBe('DENIED');
    });
  });

  describe('toLogContext', () => {
    it('should return safe logging context without sensitive data', () => {
      const principal = createPrincipal({
        id: 'user-123',
        type: SecurityPrincipalType.USER,
        organizationId: 'org-456',
        roles: ['DOCTOR'],
        permissions: [Permission.PHI_READ, Permission.PHI_WRITE],
        metadata: {
          mfaVerified: true,
          ipAddress: '10.0.0.1',
          sessionId: 'secret-session',
        },
      });
      const context = SecurityContext.create(principal, 'corr-789');

      const logContext = context.toLogContext();

      expect(logContext.correlationId).toBe('corr-789');
      expect(logContext.principalId).toBe('user-123');
      expect(logContext.principalType).toBe(SecurityPrincipalType.USER);
      expect(logContext.organizationId).toBe('org-456');
      expect(logContext.roles).toEqual(['DOCTOR']);
      expect(logContext.mfaVerified).toBe(true);

      // Should NOT include sensitive data
      expect(logContext).not.toHaveProperty('permissions');
      expect(logContext).not.toHaveProperty('ipAddress');
      expect(logContext).not.toHaveProperty('sessionId');
    });

    it('should include timestamp as ISO string', () => {
      const context = SecurityContext.create(createPrincipal(), 'corr-123');
      const logContext = context.toLogContext();

      expect(typeof logContext.timestamp).toBe('string');
      expect(logContext.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
