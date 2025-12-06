import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAuditEntry,
  type AuditEntry,
  type AuditAction,
} from '../ports/secondary/external/AuditService.js';

/**
 * Tests for AuditService Factory Functions
 *
 * Covers:
 * - createAuditEntry factory function
 * - Audit entry structure validation
 * - UUID generation
 * - Timestamp generation
 * - Optional fields handling
 * - HIPAA/GDPR compliance scenarios
 */

describe('createAuditEntry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic Audit Entry Creation', () => {
    it('should create audit entry with required fields', () => {
      const mockDate = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(mockDate);

      const entry = createAuditEntry(
        'user-123',
        'USER',
        'CREATE',
        'Case',
        'case-456',
        'corr-789',
        'SUCCESS'
      );

      expect(entry.auditId).toBeDefined();
      expect(entry.auditId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(entry.timestamp).toEqual(mockDate);
      expect(entry.correlationId).toBe('corr-789');
      expect(entry.principalId).toBe('user-123');
      expect(entry.principalType).toBe('USER');
      expect(entry.action).toBe('CREATE');
      expect(entry.resourceType).toBe('Case');
      expect(entry.resourceId).toBe('case-456');
      expect(entry.result).toBe('SUCCESS');
    });

    it('should generate unique audit IDs for each entry', () => {
      const entry1 = createAuditEntry(
        'user-1',
        'USER',
        'READ',
        'Resource',
        'id-1',
        'corr-1',
        'SUCCESS'
      );
      const entry2 = createAuditEntry(
        'user-1',
        'USER',
        'READ',
        'Resource',
        'id-1',
        'corr-1',
        'SUCCESS'
      );
      const entry3 = createAuditEntry(
        'user-1',
        'USER',
        'READ',
        'Resource',
        'id-1',
        'corr-1',
        'SUCCESS'
      );

      expect(entry1.auditId).not.toBe(entry2.auditId);
      expect(entry2.auditId).not.toBe(entry3.auditId);
      expect(entry1.auditId).not.toBe(entry3.auditId);
    });

    it('should generate timestamp at creation time', () => {
      const fixedDate = new Date('2025-03-15T08:30:00Z');
      vi.setSystemTime(fixedDate);

      const entry = createAuditEntry(
        'user-1',
        'USER',
        'UPDATE',
        'Case',
        'id-1',
        'corr-1',
        'SUCCESS'
      );

      expect(entry.timestamp).toEqual(fixedDate);
    });

    it('should handle all result types', () => {
      const results: Array<'SUCCESS' | 'FAILURE' | 'DENIED'> = ['SUCCESS', 'FAILURE', 'DENIED'];

      results.forEach((result) => {
        const entry = createAuditEntry(
          'user-1',
          'USER',
          'READ',
          'Resource',
          'id-1',
          'corr-1',
          result
        );
        expect(entry.result).toBe(result);
      });
    });
  });

  describe('Principal Types', () => {
    it('should handle USER principal type', () => {
      const entry = createAuditEntry(
        'user-123',
        'USER',
        'READ',
        'Case',
        'id-1',
        'corr-1',
        'SUCCESS'
      );

      expect(entry.principalType).toBe('USER');
      expect(entry.principalId).toBe('user-123');
    });

    it('should handle SERVICE principal type', () => {
      const entry = createAuditEntry(
        'service-worker-456',
        'SERVICE',
        'CREATE',
        'Job',
        'id-1',
        'corr-1',
        'SUCCESS'
      );

      expect(entry.principalType).toBe('SERVICE');
      expect(entry.principalId).toBe('service-worker-456');
    });

    it('should handle SYSTEM principal type', () => {
      const entry = createAuditEntry(
        'SYSTEM',
        'SYSTEM',
        'DELETE',
        'TempFile',
        'id-1',
        'corr-1',
        'SUCCESS'
      );

      expect(entry.principalType).toBe('SYSTEM');
      expect(entry.principalId).toBe('SYSTEM');
    });

    it('should handle custom principal types', () => {
      const entry = createAuditEntry(
        'api-key-789',
        'API_KEY',
        'READ',
        'Data',
        'id-1',
        'corr-1',
        'SUCCESS'
      );

      expect(entry.principalType).toBe('API_KEY');
    });
  });

  describe('Audit Actions', () => {
    it('should handle CRUD actions', () => {
      const crudActions: AuditAction[] = ['CREATE', 'READ', 'UPDATE', 'DELETE'];

      crudActions.forEach((action) => {
        const entry = createAuditEntry(
          'user-1',
          'USER',
          action,
          'Resource',
          'id-1',
          'corr-1',
          'SUCCESS'
        );
        expect(entry.action).toBe(action);
      });
    });

    it('should handle data access actions', () => {
      const dataActions: AuditAction[] = [
        'SEARCH',
        'EXPORT',
        'IMPORT',
        'DATA_ACCESS',
        'PHI_ACCESS',
      ];

      dataActions.forEach((action) => {
        const entry = createAuditEntry(
          'user-1',
          'USER',
          action,
          'PHI',
          'id-1',
          'corr-1',
          'SUCCESS'
        );
        expect(entry.action).toBe(action);
      });
    });

    it('should handle authentication actions', () => {
      const authActions: AuditAction[] = ['LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_CHANGE'];

      authActions.forEach((action) => {
        const entry = createAuditEntry(
          'user-1',
          'USER',
          action,
          'Session',
          'id-1',
          'corr-1',
          'SUCCESS'
        );
        expect(entry.action).toBe(action);
      });
    });

    it('should handle security actions', () => {
      const securityActions: AuditAction[] = [
        'MFA_ENABLED',
        'MFA_DISABLED',
        'PERMISSION_GRANT',
        'PERMISSION_REVOKE',
      ];

      securityActions.forEach((action) => {
        const entry = createAuditEntry(
          'admin-1',
          'USER',
          action,
          'User',
          'user-123',
          'corr-1',
          'SUCCESS'
        );
        expect(entry.action).toBe(action);
      });
    });

    it('should handle consent actions', () => {
      const consentActions: AuditAction[] = ['CONSENT_GRANT', 'CONSENT_REVOKE'];

      consentActions.forEach((action) => {
        const entry = createAuditEntry(
          'patient-1',
          'USER',
          action,
          'Consent',
          'id-1',
          'corr-1',
          'SUCCESS'
        );
        expect(entry.action).toBe(action);
      });
    });

    it('should handle specialized actions', () => {
      const specialActions: AuditAction[] = [
        'VERIFICATION',
        'SCORE_CALCULATION',
        'REPORT_GENERATION',
        'BULK_OPERATION',
      ];

      specialActions.forEach((action) => {
        const entry = createAuditEntry(
          'user-1',
          'USER',
          action,
          'Resource',
          'id-1',
          'corr-1',
          'SUCCESS'
        );
        expect(entry.action).toBe(action);
      });
    });
  });

  describe('Optional Fields', () => {
    it('should add optional fields through options parameter', () => {
      const entry = createAuditEntry(
        'user-123',
        'USER',
        'READ',
        'Case',
        'case-456',
        'corr-789',
        'SUCCESS',
        {
          principalRoles: ['DOCTOR', 'ADMIN'],
          organizationId: 'org-abc',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          mfaVerified: true,
          sessionId: 'session-xyz',
        }
      );

      expect(entry.principalRoles).toEqual(['DOCTOR', 'ADMIN']);
      expect(entry.organizationId).toBe('org-abc');
      expect(entry.ipAddress).toBe('192.168.1.1');
      expect(entry.userAgent).toBe('Mozilla/5.0');
      expect(entry.mfaVerified).toBe(true);
      expect(entry.sessionId).toBe('session-xyz');
    });

    it('should add error code for failures', () => {
      const entry = createAuditEntry(
        'user-123',
        'USER',
        'CREATE',
        'Case',
        'case-456',
        'corr-789',
        'FAILURE',
        {
          errorCode: 'VALIDATION_ERROR',
        }
      );

      expect(entry.result).toBe('FAILURE');
      expect(entry.errorCode).toBe('VALIDATION_ERROR');
    });

    it('should add geographic location', () => {
      const entry = createAuditEntry(
        'user-123',
        'USER',
        'READ',
        'PHI',
        'phi-789',
        'corr-123',
        'SUCCESS',
        {
          geoLocation: {
            country: 'US',
            region: 'California',
            city: 'San Francisco',
          },
        }
      );

      expect(entry.geoLocation).toEqual({
        country: 'US',
        region: 'California',
        city: 'San Francisco',
      });
    });

    it('should add custom details', () => {
      const details = {
        caseNumber: 'CASE-2025-00001',
        priority: 'HIGH',
        tags: ['urgent', 'follow-up'],
        metadata: { source: 'web-app' },
      };

      const entry = createAuditEntry(
        'user-123',
        'USER',
        'UPDATE',
        'Case',
        'case-456',
        'corr-789',
        'SUCCESS',
        {
          details,
        }
      );

      expect(entry.details).toEqual(details);
    });

    it('should track before and after states', () => {
      const beforeState = { status: 'PENDING', priority: 'NORMAL' };
      const afterState = { status: 'COMPLETED', priority: 'HIGH' };

      const entry = createAuditEntry(
        'user-123',
        'USER',
        'UPDATE',
        'Case',
        'case-456',
        'corr-789',
        'SUCCESS',
        {
          beforeState,
          afterState,
        }
      );

      expect(entry.beforeState).toEqual(beforeState);
      expect(entry.afterState).toEqual(afterState);
    });

    it('should track accessed fields for PHI', () => {
      const entry = createAuditEntry(
        'doctor-123',
        'USER',
        'PHI_ACCESS',
        'Patient',
        'patient-456',
        'corr-789',
        'SUCCESS',
        {
          accessedFields: ['name', 'dateOfBirth', 'ssn', 'medicalHistory'],
          involvesPhi: true,
          dataClassification: 'RESTRICTED',
        }
      );

      expect(entry.accessedFields).toEqual(['name', 'dateOfBirth', 'ssn', 'medicalHistory']);
      expect(entry.involvesPhi).toBe(true);
      expect(entry.dataClassification).toBe('RESTRICTED');
    });

    it('should track risk score', () => {
      const entry = createAuditEntry(
        'user-123',
        'USER',
        'EXPORT',
        'PHI',
        'bulk-export-1',
        'corr-789',
        'SUCCESS',
        {
          riskScore: 85,
        }
      );

      expect(entry.riskScore).toBe(85);
    });
  });

  describe('Data Classification', () => {
    it('should handle PUBLIC classification', () => {
      const entry = createAuditEntry(
        'user-1',
        'USER',
        'READ',
        'PublicDoc',
        'id-1',
        'corr-1',
        'SUCCESS',
        {
          dataClassification: 'PUBLIC',
        }
      );

      expect(entry.dataClassification).toBe('PUBLIC');
    });

    it('should handle INTERNAL classification', () => {
      const entry = createAuditEntry(
        'user-1',
        'USER',
        'READ',
        'InternalDoc',
        'id-1',
        'corr-1',
        'SUCCESS',
        {
          dataClassification: 'INTERNAL',
        }
      );

      expect(entry.dataClassification).toBe('INTERNAL');
    });

    it('should handle CONFIDENTIAL classification', () => {
      const entry = createAuditEntry(
        'user-1',
        'USER',
        'READ',
        'ConfDoc',
        'id-1',
        'corr-1',
        'SUCCESS',
        {
          dataClassification: 'CONFIDENTIAL',
        }
      );

      expect(entry.dataClassification).toBe('CONFIDENTIAL');
    });

    it('should handle RESTRICTED classification', () => {
      const entry = createAuditEntry(
        'user-1',
        'USER',
        'PHI_ACCESS',
        'PHI',
        'id-1',
        'corr-1',
        'SUCCESS',
        {
          dataClassification: 'RESTRICTED',
        }
      );

      expect(entry.dataClassification).toBe('RESTRICTED');
    });
  });

  describe('HIPAA Compliance Scenarios', () => {
    it('should create compliant audit entry for PHI access', () => {
      const entry = createAuditEntry(
        'doctor-456',
        'USER',
        'PHI_ACCESS',
        'PatientRecord',
        'patient-789',
        'corr-123',
        'SUCCESS',
        {
          principalRoles: ['DOCTOR'],
          organizationId: 'clinic-001',
          ipAddress: '10.0.1.50',
          userAgent: 'Chrome/100.0',
          mfaVerified: true,
          sessionId: 'session-abc',
          geoLocation: {
            country: 'US',
            region: 'NY',
            city: 'New York',
          },
          accessedFields: ['firstName', 'lastName', 'diagnosis', 'treatment'],
          involvesPhi: true,
          dataClassification: 'RESTRICTED',
          details: {
            purpose: 'Treatment',
            minimumNecessary: true,
          },
        }
      );

      expect(entry.involvesPhi).toBe(true);
      expect(entry.dataClassification).toBe('RESTRICTED');
      expect(entry.mfaVerified).toBe(true);
      expect(entry.accessedFields).toBeDefined();
      expect(entry.principalRoles).toContain('DOCTOR');
    });

    it('should create audit entry for PHI export (high risk)', () => {
      const entry = createAuditEntry(
        'surgeon-123',
        'USER',
        'PHI_EXPORT',
        'PatientData',
        'export-batch-001',
        'corr-456',
        'SUCCESS',
        {
          principalRoles: ['SURGEON', 'ADMIN'],
          mfaVerified: true,
          involvesPhi: true,
          riskScore: 95,
          dataClassification: 'RESTRICTED',
          details: {
            exportFormat: 'CSV',
            recordCount: 150,
            purpose: 'Research',
            approvedBy: 'compliance-officer-789',
          },
        }
      );

      expect(entry.action).toBe('PHI_EXPORT');
      expect(entry.riskScore).toBe(95);
      expect(entry.mfaVerified).toBe(true);
      expect(entry.involvesPhi).toBe(true);
    });

    it('should create audit entry for denied PHI access', () => {
      const entry = createAuditEntry(
        'receptionist-456',
        'USER',
        'PHI_ACCESS',
        'PatientRecord',
        'patient-789',
        'corr-789',
        'DENIED',
        {
          principalRoles: ['RECEPTIONIST'],
          errorCode: 'INSUFFICIENT_PERMISSIONS',
          involvesPhi: true,
          details: {
            denialReason: 'Role does not have PHI_READ permission',
            attemptedAccess: 'medicalHistory',
          },
        }
      );

      expect(entry.result).toBe('DENIED');
      expect(entry.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(entry.involvesPhi).toBe(true);
    });

    it('should create audit entry for failed PHI access attempt', () => {
      const entry = createAuditEntry(
        'user-suspicious',
        'USER',
        'PHI_ACCESS',
        'PatientRecord',
        'patient-vip-001',
        'corr-alert-999',
        'FAILURE',
        {
          errorCode: 'SUSPICIOUS_ACTIVITY',
          ipAddress: '203.0.113.42',
          mfaVerified: false,
          riskScore: 98,
          involvesPhi: true,
          details: {
            flags: ['unusual_location', 'after_hours', 'multiple_failed_attempts'],
            alertGenerated: true,
            securityTeamNotified: true,
          },
        }
      );

      expect(entry.result).toBe('FAILURE');
      expect(entry.riskScore).toBe(98);
      expect(entry.mfaVerified).toBe(false);
    });
  });

  describe('Integration Scenarios', () => {
    it('should create audit entry for successful login', () => {
      const entry = createAuditEntry(
        'user-123',
        'USER',
        'LOGIN',
        'Session',
        'session-abc',
        'corr-login-1',
        'SUCCESS',
        {
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          mfaVerified: true,
          geoLocation: {
            country: 'US',
            region: 'California',
          },
          details: {
            loginMethod: 'password',
            deviceType: 'desktop',
          },
        }
      );

      expect(entry.action).toBe('LOGIN');
      expect(entry.result).toBe('SUCCESS');
      expect(entry.mfaVerified).toBe(true);
    });

    it('should create audit entry for failed login attempt', () => {
      const entry = createAuditEntry(
        'user-123',
        'USER',
        'LOGIN_FAILED',
        'Session',
        'failed-session-xyz',
        'corr-fail-1',
        'FAILURE',
        {
          ipAddress: '203.0.113.50',
          errorCode: 'INVALID_CREDENTIALS',
          riskScore: 75,
          details: {
            attemptNumber: 3,
            reason: 'incorrect_password',
          },
        }
      );

      expect(entry.action).toBe('LOGIN_FAILED');
      expect(entry.result).toBe('FAILURE');
      expect(entry.riskScore).toBe(75);
    });

    it('should create audit entry for bulk operation', () => {
      const entry = createAuditEntry(
        'admin-789',
        'USER',
        'BULK_OPERATION',
        'Case',
        'bulk-update-001',
        'corr-bulk-1',
        'SUCCESS',
        {
          principalRoles: ['ADMIN'],
          mfaVerified: true,
          details: {
            operation: 'status_update',
            affectedRecords: 25,
            updateData: { status: 'ARCHIVED' },
            duration: 1500,
          },
        }
      );

      expect(entry.action).toBe('BULK_OPERATION');
      expect(entry.details).toMatchObject({
        operation: 'status_update',
        affectedRecords: 25,
      });
    });

    it('should create audit entry for permission changes', () => {
      const entry = createAuditEntry(
        'admin-123',
        'USER',
        'PERMISSION_GRANT',
        'User',
        'user-456',
        'corr-perm-1',
        'SUCCESS',
        {
          principalRoles: ['ADMIN'],
          mfaVerified: true,
          beforeState: { permissions: ['READ'] },
          afterState: { permissions: ['READ', 'WRITE', 'DELETE'] },
          details: {
            grantedPermissions: ['WRITE', 'DELETE'],
            justification: 'Promoted to senior role',
          },
        }
      );

      expect(entry.action).toBe('PERMISSION_GRANT');
      expect(entry.beforeState).toBeDefined();
      expect(entry.afterState).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      const entry = createAuditEntry('', '', 'READ', '', '', '', 'SUCCESS');

      expect(entry.principalId).toBe('');
      expect(entry.principalType).toBe('');
      expect(entry.resourceType).toBe('');
      expect(entry.resourceId).toBe('');
      expect(entry.correlationId).toBe('');
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(1000);

      const entry = createAuditEntry(
        longString,
        longString,
        'READ',
        longString,
        longString,
        longString,
        'SUCCESS'
      );

      expect(entry.principalId).toHaveLength(1000);
      expect(entry.principalType).toHaveLength(1000);
    });

    it('should handle special characters', () => {
      const entry = createAuditEntry(
        'user@example.com',
        'USER/SERVICE',
        'READ',
        'Resource:Type',
        'id-with-special-chars!@#$',
        'corr-trace-<>?',
        'SUCCESS'
      );

      expect(entry.principalId).toBe('user@example.com');
      expect(entry.principalType).toBe('USER/SERVICE');
      expect(entry.resourceId).toBe('id-with-special-chars!@#$');
    });

    it('should handle complex nested details', () => {
      const complexDetails = {
        level1: {
          level2: {
            level3: {
              array: [1, 2, 3],
              object: { key: 'value' },
              primitives: {
                string: 'test',
                number: 42,
                boolean: true,
                null: null,
              },
            },
          },
        },
      };

      const entry = createAuditEntry(
        'user-1',
        'USER',
        'UPDATE',
        'Resource',
        'id-1',
        'corr-1',
        'SUCCESS',
        {
          details: complexDetails,
        }
      );

      expect(entry.details).toEqual(complexDetails);
    });
  });

  describe('Serialization', () => {
    it('should serialize to JSON correctly', () => {
      const mockDate = new Date('2025-01-15T10:00:00Z');
      vi.setSystemTime(mockDate);

      const entry = createAuditEntry(
        'user-123',
        'USER',
        'CREATE',
        'Case',
        'case-456',
        'corr-789',
        'SUCCESS',
        {
          principalRoles: ['DOCTOR'],
          organizationId: 'org-abc',
          ipAddress: '192.168.1.1',
          mfaVerified: true,
        }
      );

      const json = JSON.stringify(entry);
      const parsed = JSON.parse(json);

      expect(parsed.principalId).toBe('user-123');
      expect(parsed.principalType).toBe('USER');
      expect(parsed.action).toBe('CREATE');
      expect(parsed.resourceType).toBe('Case');
      expect(parsed.result).toBe('SUCCESS');
      expect(new Date(parsed.timestamp)).toEqual(mockDate);
      expect(parsed.principalRoles).toEqual(['DOCTOR']);
    });

    it('should handle undefined optional fields in serialization', () => {
      const entry = createAuditEntry(
        'user-1',
        'USER',
        'READ',
        'Resource',
        'id-1',
        'corr-1',
        'SUCCESS'
      );

      const json = JSON.stringify(entry);
      const parsed = JSON.parse(json);

      // Required fields should be present
      expect(parsed.auditId).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.principalId).toBeDefined();

      // Optional fields should not be present
      expect(parsed.principalRoles).toBeUndefined();
      expect(parsed.errorCode).toBeUndefined();
      expect(parsed.ipAddress).toBeUndefined();
    });
  });
});
